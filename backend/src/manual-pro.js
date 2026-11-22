import { ObjectId } from 'mongodb';
import { createBilling } from './billing.js';
import { validId } from './mobile-auth.js';
import { flushBillingAudit } from './billing-audit.js';

export async function changeManualPro(
  database,
  spaceId,
  days,
  { reason = 'support', actor = 'local-operator', now = new Date() } = {},
) {
  if (!validId(spaceId)) throw new Error('Invalid space ID.');
  if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > 36500))
    throw new Error('Days must be an integer from 1 to 36500.');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500)
    throw new Error('Supply a reason of 1 to 500 characters.');
  const id = new ObjectId(spaceId);
  if (!(await database.households.findOne({ _id: id }))) throw new Error('Space not found.');
  await createBilling(database).ensureSubscription(id);
  const until = days === null ? null : new Date(+now + days * 86400_000);
  const event = {
    _id: new ObjectId(),
    spaceId: id,
    action: days === null ? 'manual_grant_revoked' : 'manual_grant',
    actor,
    reason: reason.trim(),
    manualGrantUntil: until,
    at: now,
  };
  await database.subscriptions.updateOne(
    { spaceId: id },
    { $set: { manualGrantUntil: until, updatedAt: now }, $push: { auditOutbox: event } },
  );
  await flushBillingAudit(database, id);
  return until;
}

export async function manualProCommand(revoke = false) {
  if (process.env.SOTOVOR_ENV_FILE) process.loadEnvFile(process.env.SOTOVOR_ENV_FILE);
  const args = process.argv.slice(2);
  const spaceId = args.shift();
  const days = revoke ? null : Number(args.shift());
  if (args.length && (args.shift() !== '--reason' || !args.length))
    throw new Error('Expected --reason followed by text.');
  const reason = args.join(' ') || 'support';
  const { connect } = await import('./db.js');
  const database = await connect();
  try {
    const until = await changeManualPro(database, spaceId, days, {
      reason,
      actor: process.env.SOTOVOR_BILLING_OPERATOR || 'local-operator',
    });
    console.log(
      until
        ? `Manual Pro granted until ${until.toISOString()}.`
        : 'Manual Pro grant revoked; paid or trial entitlements are unchanged.',
    );
  } finally {
    await database.client.close();
  }
}
