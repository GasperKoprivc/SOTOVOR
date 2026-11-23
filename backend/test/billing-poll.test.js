import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pollPayment } from '../../frontend/src/billing-poll.js';

test('checkout polling does not accept a free trial or redirect as paid confirmation', async () => {
  let reads = 0,
    confirmations = 0,
    timedOut = 0;
  await pollPayment(
    async () => {
      reads++;
      return { subscription: { plan: 'free', status: 'trialing' }, entitlements: { isPro: true } };
    },
    { timeout: 30, onConfirmed: () => confirmations++, onTimeout: () => timedOut++ },
  );
  assert.equal(reads, 1);
  assert.equal(confirmations, 0);
  assert.equal(timedOut, 1);
});

test('paid provider state confirms once and unmount aborts without a timeout message', async () => {
  let confirmed = 0;
  await pollPayment(
    async () => ({ subscription: { plan: 'pro_monthly', status: 'active' }, entitlements: { isPro: true } }),
    { onConfirmed: () => confirmed++ },
  );
  assert.equal(confirmed, 1);
  const controller = new AbortController();
  let timeout = false;
  const pending = pollPayment(async () => ({}), {
    signal: controller.signal,
    timeout: 100,
    onTimeout: () => {
      timeout = true;
    },
  });
  controller.abort();
  await pending;
  assert.equal(timeout, false);
});
