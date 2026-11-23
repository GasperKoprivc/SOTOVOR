import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { before, beforeEach, after, test } from 'node:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { connect } from '../src/db.js';
import { createApi, handleError } from '../src/api.js';
import { versionedErrors } from '../src/api-errors.js';
import { billingConfiguration } from '../src/entitlements.js';
import { createBilling } from '../src/billing.js';
import { paymentConfiguration } from '../src/billing/config.js';
import { createProvider } from '../src/billing/provider.js';
import { createBillingRuntime } from '../src/billing/runtime.js';
import { registerBillingSite } from '../src/billing/site.js';
import { registerBillingPublic } from '../src/billing/routes.js';

let database, server, base, config, provider, billing, runtime, now;
let source = 1;
const messages = [];
const dbName = 'sotovor_payments_' + randomUUID().replaceAll('-', '');
const clock = () => now;
before(async () => {
  now = new Date();
  process.env.SOTOVOR_DB = dbName;
  database = await connect();
  const app = express();
  app.set('trust proxy', 'loopback');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
  const env = {
    SOTOVOR_BILLING_ENABLED: 'true',
    SOTOVOR_BILLING_PROVIDER: 'mock',
    SOTOVOR_PUBLIC_URL: base,
    SOTOVOR_BILLING_WEBHOOK_SECRET: 'mock-test-secret-not-for-production',
  };
  config = paymentConfiguration(env);
  provider = await createProvider(database, config, { clock });
  billing = createBilling(database, billingConfiguration(env), clock);
  runtime = createBillingRuntime(database, billing, provider, config, {
    clock,
    sendMail: async (mail) => messages.push(mail),
  });
  registerBillingSite(app, billing.config, config);
  const disabled = express();
  registerBillingSite(disabled, { enabled: false }, {});
  app.use('/disabled', disabled);
  registerBillingPublic(app, runtime, database);
  const production = express();
  registerBillingPublic(
    production,
    createBillingRuntime(database, billing, provider, { ...config, production: true }, { clock }),
    database,
  );
  app.use('/production', production);
  app.use('/api/v1', versionedErrors);
  app.use(express.json());
  app.use('/api/v1', createApi(database, { billing, billingRuntime: runtime, versioned: true }));
  app.use(handleError);
});
beforeEach(() => {
  now = new Date();
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (database) {
    await database.client.db(dbName).dropDatabase();
    await database.client.close();
  }
});

async function call(path, { auth, body, method, origin, ip } = {}) {
  source++;
  const res = await fetch(base + '/api/v1' + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      'X-Forwarded-For': ip ?? `192.0.${Math.floor(source / 250)}.${source % 250}`,
      ...(auth ? (auth.includes('=') ? { cookie: auth } : { Authorization: 'Bearer ' + auth }) : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function account(language = 'sl') {
  const email = randomUUID() + '@test.invalid',
    password = 'payments-integration-test';
  const registered = await fetch(base + '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Billing', lastName: 'Test', email, phone: '+38640000111', password }),
  });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const token = (await call('/mobile/auth/login', { body: { email, password, deviceName: 'Payments test' } }))
    .body.accessToken;
  assert.equal(typeof token, 'string');
  await call('/me/appearance', { auth: token, method: 'PUT', body: { language, theme: 'dark' } });
  return { email, cookie, token };
}
async function family(language) {
  const owner = await account(language);
  const made = await call('/households', {
    auth: owner.cookie,
    body: { householdName: 'Pro payments', expectedMembers: 4 },
  });
  assert.equal(made.status, 201);
  const id = new ObjectId(made.body.householdId);
  return { id, owner, space: await database.households.findOne({ _id: id }) };
}
const path = (f, action = '') => '/spaces/' + f.id + '/billing' + (action ? '/' + action : '');
const snapshot = async (f) => (await call(path(f), { auth: f.owner.token })).body;
async function checkout(f, plan = 'monthly') {
  const result = await call(path(f, 'checkout'), { auth: f.owner.cookie, body: { plan } });
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.body.url;
}
async function complete(f, plan = 'monthly') {
  const url = await checkout(f, plan);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  const html = await page.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
  const session = new URL(url).searchParams.get('session');
  const response = await fetch(base + '/dev/mock-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ session, csrf, consent: 'yes' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  return (await database.mockBilling.findOne({ id: session })).subscriptionId;
}
async function event(id, type, at = now, extra = {}) {
  const signed = provider.sign({
    id: randomUUID(),
    type,
    subscriptionId: id,
    createdAt: at.toISOString(),
    ...extra,
  });
  return fetch(base + '/webhooks/billing/mock', {
    method: 'POST',
    headers: { ...signed.headers, 'Content-Type': 'application/json', Origin: 'https://provider.example' },
    body: signed.raw,
  });
}
async function state(id, changes) {
  const previous = await provider.getSubscription(id);
  await provider.setSubscription({ ...previous, ...changes });
}

test('mock lifecycle: local trial, hosted consent, checkout, active, grace, recovery, scheduled cancellation and expiry', async () => {
  const f = await family();
  assert.equal((await call(path(f, 'trial'), { auth: f.owner.token, body: {} })).status, 201);
  assert.equal((await snapshot(f)).entitlements.reason, 'trial');
  now = new Date(+now + 14 * 86400_000);
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  const id = await complete(f);
  assert.equal((await snapshot(f)).subscription.status, 'trialing'); // A redirect is not proof of payment.
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'active');
  await runtime.deliverMail();
  await state(id, { status: 'past_due' });
  assert.equal((await event(id, 'invoice.payment_failed')).status, 202);
  await runtime.processEvents();
  let value = await snapshot(f);
  assert.equal(value.subscription.status, 'past_due');
  assert.equal(Date.parse(value.subscription.graceUntil) - +now, 7 * 86400_000);
  await runtime.deliverMail();
  now = new Date(+now + 2 * 86400_000);
  await event(id, 'invoice.payment_failed');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.graceUntil, value.subscription.graceUntil);
  now = new Date(Date.parse(value.subscription.graceUntil));
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  await state(id, { status: 'active' });
  await event(id, 'invoice.paid');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).entitlements.isPro, true);
  assert.equal((await snapshot(f)).subscription.graceUntil, null);
  const end = new Date(+now + 2 * 86400_000);
  await state(id, { cancelAtPeriodEnd: true, currentPeriodEnd: end });
  await event(id, 'customer.subscription.updated');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'canceled');
  await runtime.deliverMail();
  now = end;
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  await state(id, { status: 'canceled', cancelAtPeriodEnd: false });
  await event(id, 'customer.subscription.deleted');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'expired');
  assert.equal((await call(path(f, 'trial'), { auth: f.owner.token, body: {} })).status, 409);
  const sent = messages.filter((mail) => mail.to === f.owner.email);
  assert.equal(sent.length, 3);
  assert.match(sent[1].text, /\/billing\/portal\//);
  assert.equal(
    await database.billingAudit.countDocuments({ spaceId: f.id, action: 'provider_state_changed' }),
    5,
  );
});

test('checkout and portal require the family admin; prices, return URLs and foreign origins cannot be injected', async () => {
  const f = await family(),
    member = await account(),
    outsider = await family();
  await call('/households/join', { auth: member.token, body: { inviteCode: f.space.inviteCode } });
  for (const auth of [member.token, member.cookie, outsider.owner.token]) {
    assert.equal((await call(path(f, 'checkout'), { auth, body: { plan: 'monthly' } })).status, 403);
    assert.equal((await call(path(f, 'portal'), { auth, body: {} })).status, 403);
  }
  for (const body of [
    { plan: 'monthly', amount: 1 },
    { plan: 'yearly', price: 'price_evil' },
    { plan: 'monthly', successUrl: 'https://evil.test' },
    { plan: 'free' },
  ])
    assert.equal((await call(path(f, 'checkout'), { auth: f.owner.token, body })).status, 400);
  assert.equal(
    (
      await call(path(f, 'checkout'), {
        auth: f.owner.cookie,
        body: { plan: 'monthly' },
        origin: 'https://evil.test',
      })
    ).status,
    403,
  );
  assert.equal((await call(path(f, 'portal'), { auth: f.owner.cookie, body: {} })).status, 409);
  const results = await Promise.all(
    [f.owner.cookie, f.owner.token].map((auth) =>
      call(path(f, 'checkout'), { auth, body: { plan: 'yearly' } }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  assert.equal(await database.mockBilling.countDocuments({ spaceId: String(f.id), kind: 'checkout' }), 1);
  assert.equal((await fetch(base + '/production/dev/mock-checkout')).status, 404);
});

test('signed webhooks are queued once, reject tampering and stale signatures, and ignore late failure after recovery', async () => {
  const f = await family();
  const id = await complete(f);
  await runtime.processEvents();
  const payload = {
    id: 'replay-' + randomUUID(),
    type: 'invoice.payment_failed',
    subscriptionId: id,
    createdAt: now.toISOString(),
    customer_email: 'never-persist-this@example.invalid',
  };
  const signed = provider.sign(payload);
  const send = (raw, headers) =>
    fetch(base + '/webhooks/billing/mock', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: raw,
    });
  assert.equal((await send(signed.raw, {})).status, 400);
  assert.equal((await send(Buffer.concat([signed.raw, Buffer.from(' ')]), signed.headers)).status, 400);
  const replay = await Promise.all([send(signed.raw, signed.headers), send(signed.raw, signed.headers)]);
  assert.ok(replay.every((res) => res.status === 202));
  assert.equal(await database.billingEvents.countDocuments({ id: payload.id }), 1);
  const latest = new Date(+now + 60000);
  await event(id, 'invoice.paid', latest);
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'active');
  await event(id, 'invoice.payment_failed', new Date(+now - 86400_000));
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'active');
  assert.equal(+(await database.subscriptions.findOne({ spaceId: f.id })).lastEventAt, +latest);
  const persisted = JSON.stringify(await database.billingEvents.find({}).toArray());
  assert.doesNotMatch(persisted, /never-persist-this/);
  now = new Date(+now + 301000);
  assert.equal((await send(signed.raw, signed.headers)).status, 400);
});

test('reconciliation repairs missed checkout events and drift and remains safe across multiple workers', async () => {
  const f = await family();
  const id = await complete(f);
  await database.billingEvents.deleteMany({ subscriptionId: id }); // Simulate a completely missed webhook.
  const otherWorker = createBillingRuntime(database, billing, provider, config, { clock });
  await Promise.all([runtime.reconcile({ force: true }), otherWorker.reconcile({ force: true })]);
  assert.equal((await snapshot(f)).subscription.status, 'active');
  await database.subscriptions.updateOne({ spaceId: f.id }, { $set: { status: 'expired', plan: 'free' } });
  await runtime.reconcile({ force: true });
  assert.equal((await snapshot(f)).subscription.plan, 'pro_monthly');
  assert.equal((await snapshot(f)).entitlements.isPro, true);
  const count = await database.billingAudit.countDocuments({ spaceId: f.id });
  await runtime.reconcile({ force: true });
  assert.equal(await database.billingAudit.countDocuments({ spaceId: f.id }), count);
  assert.equal(await database.billingMail.countDocuments({ spaceId: f.id, kind: 'welcome' }), 1);
});

test('temporary provider failure leaves the event retryable and does not unlock or lose the receipt', async () => {
  const f = await family();
  const id = await complete(f);
  const broken = createBillingRuntime(
    database,
    billing,
    {
      ...provider,
      getSubscription: async () => {
        throw new Error('Test network outage');
      },
    },
    config,
    { clock },
  );
  await broken.processEvents();
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  assert.equal((await database.billingEvents.findOne({ subscriptionId: id })).attempts, 1);
  now = new Date(+now + 6000);
  await runtime.processEvents();
  assert.equal((await snapshot(f)).entitlements.isPro, true);
});

test('billing emails use Slovenian, English and German and do not repeat after reconciliation', async () => {
  for (const [language, welcome] of [
    ['sl', 'Dobrodošli'],
    ['en', 'Welcome'],
    ['de', 'Willkommen'],
  ]) {
    const f = await family(language),
      id = await complete(f);
    await runtime.processEvents();
    await runtime.deliverMail();
    const sent = messages.filter((mail) => mail.to === f.owner.email);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].subject.startsWith(welcome));
    await state(id, { status: 'past_due' });
    await event(id, 'invoice.payment_failed');
    await runtime.processEvents();
    await runtime.deliverMail();
    await state(id, {
      status: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(+now + 2 * 86400_000),
    });
    await event(id, 'customer.subscription.updated');
    await runtime.processEvents();
    await runtime.deliverMail();
    const all = messages.filter((mail) => mail.to === f.owner.email);
    assert.equal(all.length, 3);
    assert.match(all[1].subject, { sl: /ni uspelo/, en: /failed/, de: /fehlgeschlagen/ }[language]);
    assert.match(all[2].subject, { sl: /kmalu/, en: /ends soon/, de: /bald/ }[language]);
    await runtime.reconcile({ force: true });
    await runtime.deliverMail();
    assert.equal(messages.filter((mail) => mail.to === f.owner.email).length, 3);
  }
});

test('account deletion cancels owned paid subscriptions but deleting a member leaves family Pro intact', async () => {
  const f = await family(),
    member = await account();
  await call('/households/join', { auth: member.token, body: { inviteCode: f.space.inviteCode } });
  const id = await complete(f);
  await runtime.processEvents();
  assert.equal(
    (
      await call('/me', {
        auth: member.token,
        method: 'DELETE',
        body: { password: 'payments-integration-test', deleteOwnedFamilies: true },
      })
    ).status,
    200,
  );
  assert.equal((await provider.getSubscription(id)).status, 'active');
  assert.equal(
    (
      await call('/me', {
        auth: f.owner.token,
        method: 'DELETE',
        body: { password: 'payments-integration-test', deleteOwnedFamilies: true },
      })
    ).status,
    200,
  );
  assert.equal((await provider.getSubscription(id)).status, 'canceled');
  assert.equal(await database.households.countDocuments({ _id: f.id }), 0);
  await event(id, 'customer.subscription.updated');
  await runtime.processEvents();
  assert.equal(await database.subscriptions.countDocuments({ spaceId: f.id }), 0);
});

test('paid subscription cannot be overwritten by another checkout or a local trial', async () => {
  const f = await family(),
    id = await complete(f);
  await runtime.processEvents();
  assert.equal(
    (await call(path(f, 'checkout'), { auth: f.owner.cookie, body: { plan: 'monthly' } })).body.error.code,
    'SUBSCRIPTION_EXISTS',
  );
  assert.equal((await call(path(f, 'trial'), { auth: f.owner.token, body: {} })).status, 409);
  const portal = await call(path(f, 'portal'), { auth: f.owner.token, body: {} });
  assert.equal(portal.status, 200);
  assert.equal((await fetch(portal.body.url)).status, 200);
  await state(id, { status: 'canceled', cancelAtPeriodEnd: false });
  await event(id, 'customer.subscription.deleted');
  await runtime.processEvents();
  assert.equal((await call(path(f, 'trial'), { auth: f.owner.token, body: {} })).status, 201);
  await event(id, 'customer.subscription.deleted');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).entitlements.reason, 'trial');
});

test('unsupported provider state and changed customer binding fail closed without handing out a foreign portal', async () => {
  const f = await family(),
    id = await complete(f);
  await runtime.processEvents();
  const original = await provider.getSubscription(id);
  await state(id, { customerId: 'mock_cus_foreign' });
  await event(id, 'customer.subscription.updated');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  assert.equal(
    (await database.subscriptions.findOne({ spaceId: f.id })).providerCustomerId,
    original.customerId,
  );
  await state(id, { ...original, plan: 'unknown' });
  await runtime.reconcile({ force: true });
  assert.equal((await snapshot(f)).subscription.status, 'expired');
  await provider.setSubscription(original);
  await runtime.reconcile({ force: true });
  assert.equal((await snapshot(f)).entitlements.isPro, true);
});

test('scheduled cancellation never extends failed-payment grace and recovered failures do not send stale emails', async () => {
  const f = await family(),
    id = await complete(f);
  await runtime.processEvents();
  await runtime.deliverMail();
  await state(id, {
    status: 'past_due',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date(+now + 30 * 86400_000),
  });
  await event(id, 'invoice.payment_failed');
  await runtime.processEvents();
  assert.equal((await snapshot(f)).subscription.status, 'past_due');
  const grace = (await snapshot(f)).subscription.graceUntil;
  now = new Date(Date.parse(grace));
  assert.equal((await snapshot(f)).entitlements.isPro, false);
  await state(id, { status: 'active', cancelAtPeriodEnd: false });
  await event(id, 'invoice.paid');
  await runtime.processEvents();
  await runtime.deliverMail();
  assert.equal(messages.filter((mail) => mail.to === f.owner.email).length, 1);
});

test('mock checkout requires explicit consent and replay cannot reactivate a canceled subscription', async () => {
  const f = await family(),
    url = await checkout(f);
  const session = new URL(url).searchParams.get('session');
  const record = await database.mockBilling.findOne({ id: session });
  const submit = (consent) =>
    fetch(base + '/dev/mock-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ session, csrf: record.csrf, consent }),
      redirect: 'manual',
    });
  assert.equal((await submit('no')).status, 400);
  assert.equal(await database.mockBilling.countDocuments({ kind: 'subscription', spaceId: String(f.id) }), 0);
  assert.equal((await submit('yes')).status, 303);
  const id = await provider.getCheckoutSubscription(session);
  await runtime.processEvents();
  await state(id, { status: 'canceled', cancelAtPeriodEnd: false });
  assert.equal((await submit('yes')).status, 303);
  await runtime.reconcile({ force: true });
  assert.equal((await snapshot(f)).entitlements.isPro, false);
});

test('checkout throttles repeated requests and an expired subscription can be replaced even with a missed checkout webhook', async () => {
  const f = await family(),
    id = await complete(f);
  await runtime.processEvents();
  await state(id, { status: 'canceled', cancelAtPeriodEnd: false });
  await runtime.reconcile({ force: true });
  now = new Date(+now + 33 * 60000);
  const replacement = await complete(f, 'yearly');
  await database.billingEvents.deleteMany({ subscriptionId: replacement });
  await runtime.reconcile({ force: true });
  assert.equal((await snapshot(f)).subscription.plan, 'pro_yearly');
  const options = { auth: f.owner.token, body: { plan: 'monthly' }, ip: '198.51.100.77' };
  for (let i = 0; i < 12; i++) assert.equal((await call(path(f, 'checkout'), options)).status, 409);
  const limited = await call(path(f, 'checkout'), options);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'BILLING_RATE_LIMIT');
});

test('checkout cannot duplicate a completed purchase after reservation expiry when its webhook is missing', async () => {
  const f = await family(),
    id = await complete(f);
  await database.billingEvents.deleteMany({ subscriptionId: id });
  now = new Date(+now + 33 * 60000);
  const result = await call(path(f, 'checkout'), { auth: f.owner.token, body: { plan: 'yearly' } });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'SUBSCRIPTION_EXISTS');
  assert.equal((await snapshot(f)).subscription.status, 'active');
  assert.equal(await database.mockBilling.countDocuments({ kind: 'checkout', spaceId: String(f.id) }), 1);
});

test('public billing config is sanitized, honors feature overrides and hides all pricing metadata when disabled', async () => {
  const publicConfig = await (await fetch(base + '/api/v1/billing/config')).json();
  assert.equal(publicConfig.enabled, true);
  assert.equal(publicConfig.free.members, 5);
  assert.equal(publicConfig.pro.members, 12);
  assert.equal(publicConfig.freeFeatures.ics, false);
  assert.equal(publicConfig.proFeatures.ics, true);
  assert.doesNotMatch(JSON.stringify(publicConfig), /secret|key|price_|provider|customer/i);
  assert.deepEqual(await (await fetch(base + '/disabled/api/v1/billing/config')).json(), { enabled: false });
  assert.deepEqual(await (await fetch(base + '/api/v1/legal/terms')).json(), { text: null });
  const f = await family();
  const url = await checkout(f);
  const record = await database.mockBilling.findOne({ id: new URL(url).searchParams.get('session') });
  assert.equal(new URL(record.successUrl).pathname, '/pro');
  assert.equal(new URL(record.successUrl).searchParams.get('billing'), 'success');
  assert.equal(new URL(record.cancelUrl).pathname, '/pro');
  assert.equal(new URL(record.cancelUrl).searchParams.has('billing'), false);
});
