import { existsSync } from 'node:fs';
import { connect } from '../backend/src/db.js';
import { createBilling } from '../backend/src/billing.js';
import { paymentConfiguration } from '../backend/src/billing/config.js';
import { createProvider } from '../backend/src/billing/provider.js';
import { createBillingRuntime } from '../backend/src/billing/runtime.js';
import { smtpVerification } from '../backend/src/email-verification.js';

if (process.env.SOTOVOR_ENV_FILE) process.loadEnvFile(process.env.SOTOVOR_ENV_FILE);
else if (existsSync('.env')) process.loadEnvFile();
const config = paymentConfiguration();
if (config.enabled) {
  const database = await connect();
  try {
    const runtime = createBillingRuntime(
      database,
      createBilling(database),
      await createProvider(database, config),
      config,
      { sendMail: smtpVerification()?.sendMessage },
    );
    await runtime.processEvents();
    const ran = await runtime.reconcile({ force: true });
    await runtime.deliverMail();
    console.log(
      ran ? 'Billing reconciliation completed.' : 'Another billing worker holds the reconciliation lock.',
    );
  } finally {
    await database.client.close();
  }
} else console.log('Billing is disabled; no provider calls were made.');
