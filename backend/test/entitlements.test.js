import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertLimit,
  billingConfiguration,
  defaultBillingConfig,
  getEntitlements,
} from '../src/entitlements.js';

const now = new Date('2026-11-22T12:00:00Z');
const before = new Date(+now - 1);
const after = new Date(+now + 1);
const config = billingConfiguration({ SOTOVOR_BILLING_ENABLED: 'true' });

test('entitlements are pure, time-bounded and configurable at exact clock edges', () => {
  const cases = [
    [null, false, 'free'],
    [{ status: 'none' }, false, 'free'],
    [{ status: 'active' }, true, 'active'],
    [{ status: 'expired', currentPeriodEnd: after }, false, 'free'],
    [{ status: 'trialing', trialEndsAt: after }, true, 'trial'],
    [{ status: 'trialing', trialEndsAt: now }, false, 'free'],
    [{ status: 'trialing', trialEndsAt: before }, false, 'free'],
    [{ status: 'trialing', trialEndsAt: 'invalid' }, false, 'free'],
    [{ status: 'past_due', graceUntil: after }, true, 'grace'],
    [{ status: 'past_due', graceUntil: now }, false, 'free'],
    [{ status: 'past_due', currentPeriodEnd: after }, false, 'free'],
    [{ status: 'canceled', currentPeriodEnd: after }, true, 'canceled_period'],
    [{ status: 'canceled', currentPeriodEnd: now }, false, 'free'],
    [{ status: 'canceled', currentPeriodEnd: before }, false, 'free'],
    [{ status: 'expired', manualGrantUntil: after }, true, 'manual_grant'],
    [{ status: 'expired', manualGrantUntil: now }, false, 'free'],
    [{ status: 'trialing', trialEndsAt: before, manualGrantUntil: after }, true, 'manual_grant'],
  ];
  for (const [sub, pro, reason] of cases) {
    const value = getEntitlements({}, sub, now, config);
    assert.equal(value.isPro, pro, JSON.stringify(sub));
    assert.equal(value.reason, reason);
    assert.equal(value.limits.members, pro ? 12 : 5);
    assert.equal(value.features.ics, pro);
  }
  const unlocked = getEntitlements({}, null, now);
  assert.equal(unlocked.reason, 'billing_disabled');
  assert.ok(Object.values(unlocked.limits).every((limit) => limit === null));
  assert.ok(Object.values(unlocked.features).every(Boolean));
  unlocked.limits.members = 99;
  assert.equal(defaultBillingConfig.pro.members, 12);
  assert.doesNotThrow(() => assertLimit('members', 4, getEntitlements({}, null, now, config), 'id'));
  assert.throws(
    () => assertLimit('members', 5, getEntitlements({}, null, now, config), 'id'),
    (error) => error.code === 'PLAN_REQUIRED' && error.details.limit === 5,
  );
});

test('billing startup configuration validates only enabled billing settings', () => {
  assert.equal(
    billingConfiguration({ SOTOVOR_BILLING_PROVIDER: 'future', SOTOVOR_LIMIT_FREE_MEMBERS: 'bad' }).enabled,
    false,
  );
  for (const env of [
    { SOTOVOR_BILLING_ENABLED: '1' },
    { SOTOVOR_BILLING_ENABLED: 'true', SOTOVOR_BILLING_PROVIDER: 'unsupported' },
    { SOTOVOR_BILLING_ENABLED: 'true', SOTOVOR_LIMIT_FREE_MEMBERS: '-1' },
    { SOTOVOR_BILLING_ENABLED: 'true', SOTOVOR_LIMIT_FREE_ICS: '1' },
  ]) {
    assert.throws(() => billingConfiguration(env));
  }
  const changed = billingConfiguration({
    SOTOVOR_BILLING_ENABLED: 'true',
    SOTOVOR_LIMIT_FREE_MEMBERS: '8',
    SOTOVOR_LIMIT_PRO_MEMBERS: 'unlimited',
    SOTOVOR_LIMIT_FREE_ICS: 'true',
  });
  assert.equal(changed.free.members, 8);
  assert.equal(changed.pro.members, null);
  assert.equal(changed.freeFeatures.ics, true);
});
