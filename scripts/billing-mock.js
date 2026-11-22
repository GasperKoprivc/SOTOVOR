import { existsSync } from 'node:fs';
import { ObjectId } from 'mongodb';
import { connect } from '../backend/src/db.js';
import { createBilling } from '../backend/src/billing.js';
import { paymentConfiguration } from '../backend/src/billing/config.js';
import { createProvider } from '../backend/src/billing/provider.js';
import { createBillingRuntime } from '../backend/src/billing/runtime.js';
import { smtpVerification } from '../backend/src/email-verification.js';

if (process.env.SOTOVOR_ENV_FILE) process.loadEnvFile(process.env.SOTOVOR_ENV_FILE);
else if (existsSync('.env')) process.loadEnvFile();
const config = paymentConfiguration();
const [spaceId, action, rawDays = '2'] = process.argv.slice(2);
const days = Number(rawDays);
if (!config.enabled || config.provider !== 'mock' || config.production)
  throw new Error('Mock billing commands require enabled mock billing outside production.');
if (
  !/^[a-f0-9]{24}$/.test(spaceId ?? '') ||
  !['active', 'past_due', 'cancel', 'expired'].includes(action) ||
  !Number.isInteger(days) ||
  days < 1 ||
  days > 3650
)
  throw new Error('Usage: node scripts/billing-mock.js <spaceId> active|past_due|cancel|expired [days=2]');
const database = await connect();
try {
  const provider = await createProvider(database, config);
  const own = await database.subscriptions.findOne({ spaceId: new ObjectId(spaceId) });
  const id =
    own?.providerSubscriptionId ??
    (await database.mockBilling.findOne({ kind: 'subscription', spaceId }))?._id;
  const previous = id && (await provider.getSubscription(id));
  if (!previous) throw new Error('Complete a mock checkout for this space first.');
  const now = new Date();
  await provider.setSubscription({
    ...previous,
    status: action === 'expired' ? 'canceled' : action === 'past_due' ? 'past_due' : 'active',
    cancelAtPeriodEnd: action === 'cancel',
    currentPeriodEnd: new Date(+now + days * 86400_000),
  });
  const runtime = createBillingRuntime(database, createBilling(database), provider, config, {
    sendMail: smtpVerification()?.sendMessage,
  });
  const signed = provider.sign({
    id: 'mock_script_' + new ObjectId(),
    type:
      action === 'expired'
        ? 'customer.subscription.deleted'
        : action === 'past_due'
          ? 'invoice.payment_failed'
          : 'customer.subscription.updated',
    subscriptionId: id,
    createdAt: now.toISOString(),
  });
  await runtime.enqueue(provider.verifyAndParseWebhook(signed.raw, signed.headers));
  await runtime.processEvents();
  await runtime.deliverMail();
  console.log('Mock subscription transition processed.');
} finally {
  await database.client.close();
}
