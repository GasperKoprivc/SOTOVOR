import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { before, after, test } from 'node:test';
import express from 'express';
import { Binary, ObjectId } from 'mongodb';
import { connect } from '../src/db.js';
import { createApi, handleError } from '../src/api.js';
import { versionedErrors } from '../src/api-errors.js';
import { createBilling } from '../src/billing.js';
import { billingConfiguration } from '../src/entitlements.js';
import { changeManualPro } from '../src/manual-pro.js';
import { createWhatsApp } from '../src/whatsapp.js';
import { codeHash } from '../src/whatsapp.js';
import { hash } from '../src/mobile-auth.js';
import { householdDay, planTasks } from '../src/planning.js';

let database, billing, server, base;
let now = new Date('2026-11-22T12:00:00Z');
let fixtureIp = 1;
const name = 'sotovor_billing_' + randomUUID().replaceAll('-', '');
const config = billingConfiguration({ SOTOVOR_BILLING_ENABLED: 'true' });
const wa = { secret: 'billing-test-only', verify: 'test-only', phoneId: '123' };
before(async () => {
  process.env.SOTOVOR_DB = name;
  database = await connect();
  billing = createBilling(database, config, () => now);
  const app = express();
  // Each synthetic account has a distinct source address; production rate limits stay enabled.
  app.set('trust proxy', 'loopback');
  app.use('/webhooks/whatsapp', createWhatsApp(database, wa, undefined, billing));
  app.use('/api/v1', versionedErrors);
  app.use(express.json());
  const options = {
    billing,
    whatsappEnabled: true,
    transcription: { transcribe: async () => 'test transcript' },
  };
  app.use('/api/v1', createApi(database, { ...options, versioned: true }));
  app.use(
    '/disabled/api/v1',
    versionedErrors,
    createApi(database, { ...options, transcription: null, versioned: true }),
  );
  app.use('/api', createApi(database, options));
  app.use(handleError);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (database) {
    await database.client.db(name).dropDatabase();
    await database.client.close();
  }
});

async function call(path, { auth, body, method, space, legacy = false } = {}) {
  const res = await fetch(base + (legacy ? '/api' : '/api/v1') + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      'X-Forwarded-For': '192.0.2.' + fixtureIp++,
      ...(auth?.includes('=') ? { cookie: auth } : auth ? { Authorization: 'Bearer ' + auth } : {}),
      ...(space ? { 'X-Sotovor-Household': String(space) } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function account() {
  const email = randomUUID() + '@test.invalid',
    password = 'billing-test-password';
  const res = await fetch(base + '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Pro', lastName: 'Test', email, phone: '+38640000111', password }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const login = await call('/mobile/auth/login', { body: { email, password, deviceName: 'Billing test' } });
  assert.equal(login.status, 200);
  return { cookie, token: login.body.accessToken, email };
}
async function family() {
  const owner = await account();
  const made = await call('/households', {
    auth: owner.cookie,
    body: { householdName: 'Billing family', expectedMembers: 4 },
  });
  assert.equal(made.status, 201);
  const id = new ObjectId(made.body.householdId);
  const space = await database.households.findOne({ _id: id });
  return { owner, space, id };
}
function required(result, feature, current, limit) {
  assert.equal(result.status, 403, JSON.stringify(result));
  assert.equal(result.body.error.code, 'PLAN_REQUIRED');
  assert.equal(result.body.error.details.feature, feature);
  assert.equal(typeof result.body.error.details.upgradeUrl, 'string');
  if (current !== undefined) assert.equal(result.body.error.details.current, current);
  if (limit !== undefined) assert.equal(result.body.error.details.limit, limit);
}

test('billing is space scoped, readable by members, trial is admin-only and atomic once', async () => {
  const a = await family(),
    b = await family(),
    member = await account();
  assert.equal((await call('/spaces/' + a.id + '/billing')).status, 401);
  assert.equal((await call('/spaces/' + a.id + '/billing', { auth: b.owner.token })).status, 403);
  const joined = await call('/households/join', {
    auth: member.token,
    body: { inviteCode: a.space.inviteCode },
  });
  assert.equal(joined.status, 201);
  const read = await call('/spaces/' + a.id + '/billing', { auth: member.token });
  assert.equal(read.body.mayManageBilling, false);
  assert.equal(read.body.entitlements.isPro, false);
  assert.equal(JSON.stringify(read.body).includes('providerCustomerId'), false);
  assert.equal(
    (await call('/spaces/' + a.id + '/billing/trial', { auth: member.cookie, body: {} })).status,
    403,
  );
  const trials = await Promise.all(
    [a.owner.token, a.owner.cookie].map((auth) =>
      call('/spaces/' + a.id + '/billing/trial', { auth, body: {} }),
    ),
  );
  assert.deepEqual(trials.map((x) => x.status).sort(), [201, 409]);
  const value = (await call('/spaces/' + a.id + '/billing', { auth: member.cookie })).body;
  assert.equal(value.entitlements.reason, 'trial');
  assert.equal(Date.parse(value.subscription.trialEndsAt) - +now, 14 * 86400_000);
  assert.equal(await database.billingAudit.countDocuments({ spaceId: a.id, action: 'trial_started' }), 1);
  assert.equal(
    (await call('/spaces/' + b.id + '/billing', { auth: b.owner.token })).body.entitlements.isPro,
    false,
  );
  now = new Date(+now + 14 * 86400_000);
  assert.equal(
    (await call('/spaces/' + a.id + '/billing', { auth: a.owner.cookie })).body.entitlements.isPro,
    false,
  );
  assert.equal(
    (await call('/spaces/' + a.id + '/billing/trial', { auth: a.owner.cookie, body: {} })).status,
    409,
  );
  now = new Date('2026-11-22T12:00:00Z');
});

test('member limits hold under concurrent invitation acceptance and preserve downgraded members', async () => {
  const f = await family();
  await database.households.updateOne(
    { _id: f.id },
    {
      $push: {
        members: {
          $each: Array.from({ length: 3 }, () => ({ id: new ObjectId().toHexString(), name: 'Existing' })),
        },
      },
    },
  );
  const people = await Promise.all([account(), account()]);
  const results = await Promise.all(
    people.map((person) =>
      call('/households/join', { auth: person.token, body: { inviteCode: f.space.inviteCode } }),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 403]);
  required(
    results.find((x) => x.status === 403),
    'members',
    5,
    5,
  );
  await changeManualPro(database, String(f.id), 30, { now });
  const more = await account();
  assert.equal(
    (await call('/households/join', { auth: more.cookie, body: { inviteCode: f.space.inviteCode } })).status,
    201,
  );
  await database.households.updateOne(
    { _id: f.id },
    {
      $push: {
        members: {
          $each: [
            { id: 'old7', name: 'Seven' },
            { id: 'old8', name: 'Eight' },
          ],
        },
      },
    },
  );
  await changeManualPro(database, String(f.id), null, { now });
  const ninth = await account();
  required(
    await call('/households/join', { auth: ninth.cookie, body: { inviteCode: f.space.inviteCode } }),
    'members',
    8,
    5,
  );
  assert.equal((await call('/dashboard', { auth: more.token })).body.members.length, 8);
  assert.equal(
    (await call('/entries', { auth: more.token, body: { kind: 'task', title: 'Daily free workflow' } }))
      .status,
    201,
  );
});

test('only successful planner previews count, atomic quota resets monthly and grants unlock', async () => {
  const f = await family();
  assert.equal((await call('/planning/preview', { auth: f.owner.token, body: {} })).status, 200);
  assert.equal(
    (await call('/spaces/' + f.id + '/billing', { auth: f.owner.token })).body.usage.planningProposals,
    0,
  );
  await call('/entries', { auth: f.owner.token, body: { kind: 'task', title: 'Plan this' } });
  const tasks = await database.entries.find({ householdId: f.id }).toArray();
  const forged = hash(JSON.stringify(planTasks(tasks, f.space.members, householdDay(), false)));
  assert.equal(
    (await call('/planning/apply', { auth: f.owner.token, body: { signature: forged } })).status,
    409,
  );
  assert.equal(
    (await call('/planning/preview', { auth: f.owner.token, body: { rebalance: 'bad' } })).status,
    400,
  );
  const previews = await Promise.all(
    Array.from({ length: 4 }, () => call('/planning/preview', { auth: f.owner.token, body: {} })),
  );
  assert.equal(previews.filter((x) => x.status === 200).length, 2);
  const approved = previews.find((x) => x.status === 200).body.signature;
  assert.equal(
    (await call('/planning/apply', { auth: f.owner.token, body: { signature: approved } })).status,
    200,
  );
  for (const result of previews.filter((x) => x.status !== 200)) required(result, 'planningProposals', 2, 2);
  await call('/entries', { auth: f.owner.token, body: { kind: 'task', title: 'Another task' } });
  await changeManualPro(database, String(f.id), 1, { reason: 'Beta tester', actor: 'integration-test', now });
  assert.equal((await call('/planning/preview', { auth: f.owner.cookie, body: {} })).status, 200);
  await changeManualPro(database, String(f.id), null, { now });
  now = new Date('2026-12-01T00:00:00Z');
  assert.equal((await call('/planning/preview', { auth: f.owner.token, body: {} })).status, 200);
  assert.equal(
    (await call('/spaces/' + f.id + '/billing', { auth: f.owner.token })).body.usage.planningProposals,
    1,
  );
  now = new Date('2026-11-22T12:00:00Z');
  assert.equal(
    await database.billingAudit.countDocuments({
      spaceId: f.id,
      action: { $in: ['manual_grant', 'manual_grant_revoked'] },
    }),
    2,
  );
});

test('feature gates cover cookie and bearer clients; downgrade preserves reading, export and free work', async () => {
  const f = await family();
  for (const auth of [f.owner.token, f.owner.cookie]) {
    required(await call('/whatsapp/pair', { auth, body: {} }), 'whatsapp');
    required(await call('/whatsapp/unlink', { auth, body: {} }), 'whatsapp');
    required(await call('/calendar/subscription', { auth, body: {} }), 'ics');
    required(await call('/statistics?range=all', { auth }), 'allTimeStatistics');
    required(
      await call('/rewards', { auth, method: 'PUT', body: { leaderboard: true, rewards: [] } }),
      'rewards',
    );
    required(
      await call('/entries', { auth, body: { kind: 'task', title: 'Points', points: 10 } }),
      'rewards',
    );
  }
  for (const range of ['7', '30'])
    assert.equal((await call('/statistics?range=' + range, { auth: f.owner.token })).status, 200);
  const entryId = new ObjectId();
  await database.entries.insertOne({
    _id: entryId,
    householdId: f.id,
    kind: 'task',
    title: 'Keep voice',
    voice: { mime: 'audio/webm', bytes: new Binary(Buffer.from('1a45dfa30000', 'hex')) },
    completedAt: null,
  });
  required(
    await call('/entries/' + entryId + '/transcription', { auth: f.owner.token, body: {} }),
    'transcription',
  );
  const unavailable = await fetch(base + '/disabled/api/v1/entries/' + entryId + '/transcription', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + f.owner.token, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(
    unavailable.status,
    404,
    'A disabled transcription provider must not be advertised as an available Pro feature.',
  );
  await call('/spaces/' + f.id + '/billing/trial', { auth: f.owner.token, body: {} });
  const subscription = await call('/calendar/subscription', { auth: f.owner.token, body: {} });
  assert.equal(subscription.status, 201);
  const secondSpace = await call('/households', {
    auth: f.owner.cookie,
    body: { householdName: 'Free second space', expectedMembers: 2 },
  });
  const freeSpace = secondSpace.body.householdId;
  required(await call('/calendar/subscription', { auth: f.owner.token, space: freeSpace, body: {} }), 'ics');
  await call('/entries', {
    auth: f.owner.token,
    space: freeSpace,
    body: { kind: 'event', title: 'Do not leak free ICS', dueOn: '2026-11-25' },
  });
  const icsBefore = await (await fetch(base + subscription.body.path)).text();
  assert.doesNotMatch(icsBefore, /Do not leak free ICS/);
  assert.equal((await call('/statistics?range=all', { auth: f.owner.token })).status, 200);
  assert.equal((await call('/whatsapp/pair', { auth: f.owner.token, body: {} })).status, 200);
  assert.equal(
    (await call('/entries/' + entryId + '/transcription', { auth: f.owner.token, body: {} })).status,
    200,
  );
  assert.equal(
    (await call('/rewards', { auth: f.owner.token, method: 'PUT', body: { leaderboard: true, rewards: [] } }))
      .status,
    200,
  );
  now = new Date(+now + 14 * 86400_000);
  const feed = await fetch(base + subscription.body.path);
  assert.equal(feed.status, 403);
  assert.equal((await feed.json()).error.code, 'PLAN_REQUIRED');
  const voice = await fetch(base + '/api/v1/entries/' + entryId + '/voice', {
    headers: { Authorization: 'Bearer ' + f.owner.token },
  });
  assert.equal(voice.status, 200);
  const exported = await call('/me/export', { auth: f.owner.token });
  assert.equal(exported.status, 200);
  assert.equal(
    exported.body.entries.find((entry) => entry.id === String(entryId)).voice.data,
    Buffer.from('1a45dfa30000', 'hex').toString('base64'),
  );
  assert.equal((await call('/rewards', { auth: f.owner.token })).status, 200);
  assert.equal((await call('/shopping', { auth: f.owner.token, body: { title: 'Still free' } })).status, 201);
  assert.equal((await call('/calendar/subscription', { auth: f.owner.token, method: 'DELETE' })).status, 200);
  assert.equal(await database.entries.countDocuments({ householdId: f.id }), 1);
  now = new Date('2026-11-22T12:00:00Z');
});

test('Pro member cap is 12, inactive members do not count, grants do not reset trial history', async () => {
  const f = await family();
  await changeManualPro(database, String(f.id), 1, { now });
  await database.households.updateOne(
    { _id: f.id },
    {
      $push: {
        members: {
          $each: Array.from({ length: 11 }, () => ({ id: new ObjectId().toHexString(), name: 'Member' })),
        },
      },
    },
  );
  const next = await account();
  required(
    await call('/households/join', { auth: next.token, body: { inviteCode: f.space.inviteCode } }),
    'members',
    12,
    12,
  );
  await database.households.updateOne({ _id: f.id }, { $set: { 'members.11.inactive': true } });
  assert.equal(
    (await call('/households/join', { auth: next.token, body: { inviteCode: f.space.inviteCode } })).status,
    201,
  );
  const trial = await call('/spaces/' + f.id + '/billing/trial', { auth: f.owner.token, body: {} });
  assert.equal(trial.status, 201);
  await changeManualPro(database, String(f.id), null, { now });
  assert.equal(
    (await call('/spaces/' + f.id + '/billing', { auth: f.owner.cookie })).body.entitlements.reason,
    'trial',
  );
  await changeManualPro(database, String(f.id), 1, { now });
  assert.equal(
    (await call('/spaces/' + f.id + '/billing/trial', { auth: f.owner.token, body: {} })).status,
    409,
  );
  await assert.rejects(changeManualPro(database, 'invalid', 2));
  await assert.rejects(changeManualPro(database, String(f.id), 0, { now }));
  await assert.rejects(changeManualPro(database, new ObjectId().toHexString(), 2));
});

test('stored voice quota is concurrent-safe, counts old archived recordings and releases failed reservations', async () => {
  const f = await family();
  await database.entries.insertMany(
    Array.from({ length: 19 }, () => ({
      householdId: f.id,
      kind: 'task',
      title: 'Old',
      archivedAt: new Date(),
      voice: { mime: 'audio/webm', bytes: new Binary(Buffer.from('1a45dfa30000', 'hex')) },
    })),
  );
  const voice = { mime: 'audio/webm', data: Buffer.from('1a45dfa30000', 'hex').toString('base64') };
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      call('/entries', { legacy: true, auth: f.owner.cookie, body: { kind: 'task', title: 'Voice', voice } }),
    ),
  );
  assert.equal(results.filter((x) => x.status === 201).length, 1);
  for (const result of results.filter((x) => x.status !== 201)) required(result, 'voiceNotes', 20, 20);
  assert.equal(await database.entries.countDocuments({ householdId: f.id, voice: { $exists: true } }), 20);
  const other = await family();
  const release = await billing.reserveVoice(other.space);
  await release();
  assert.equal(
    (await database.entitlementUsage.findOne({ spaceId: other.id, feature: 'voiceNotes' })).count,
    0,
  );
  await changeManualPro(database, String(f.id), 10, { now });
  assert.equal(
    (
      await call('/entries', {
        legacy: true,
        auth: f.owner.cookie,
        body: { kind: 'task', title: 'Pro voice', voice },
      })
    ).status,
    201,
  );
});

test('verified WhatsApp deliveries cannot pair or import for a free or expired space', async () => {
  const f = await family();
  const sender = '38640000111',
    code = 'a'.repeat(24);
  await database.households.updateOne(
    { _id: f.id },
    { $set: { whatsappPairing: { hash: codeHash(code), expiresAt: new Date(Date.now() + 60000) } } },
  );
  async function send(text) {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: wa.phoneId },
                messages: [{ id: randomUUID(), type: 'text', from: sender, text: { body: text } }],
              },
            },
          ],
        },
      ],
    });
    return fetch(base + '/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=' + createHmac('sha256', wa.secret).update(payload).digest('hex'),
      },
      body: payload,
    });
  }
  assert.equal((await send('poveži ' + code)).status, 403);
  await changeManualPro(database, String(f.id), 3, { now });
  assert.equal((await send('poveži ' + code)).status, 200);
  assert.equal((await send('opravilo Allowed')).status, 200);
  await changeManualPro(database, String(f.id), null, { now });
  assert.equal((await send('opravilo Blocked')).status, 403);
  assert.equal(await database.entries.countDocuments({ householdId: f.id }), 1);
});

test('trial and support audit events survive an interrupted audit write and replay once', async () => {
  const f = await family();
  const faulty = {
    ...database,
    billingAudit: {
      updateOne: async () => {
        throw new Error('Simulated audit outage');
      },
    },
  };
  const failingBilling = createBilling(faulty, config, () => now);
  await assert.rejects(failingBilling.startTrial(f.space, new ObjectId()));
  const pending = await database.subscriptions.findOne({ spaceId: f.id });
  assert.equal(pending.status, 'trialing');
  assert.equal(pending.auditOutbox.length, 1);
  assert.equal((await billing.snapshot(f.space, true)).entitlements.reason, 'trial');
  await billing.snapshot(f.space, true);
  assert.equal(await database.billingAudit.countDocuments({ spaceId: f.id, action: 'trial_started' }), 1);
  await assert.rejects(changeManualPro(faulty, String(f.id), 2, { now }));
  assert.equal((await billing.snapshot(f.space, true)).entitlements.reason, 'manual_grant');
  assert.equal(await database.billingAudit.countDocuments({ spaceId: f.id, action: 'manual_grant' }), 1);
  assert.equal((await database.subscriptions.findOne({ spaceId: f.id })).auditOutbox.length, 0);
});

test('statistics count only the requested task history and keep all-time server gated', async () => {
  const f = await family();
  const time = Date.now();
  await database.entries.insertMany([
    ...[6, 15, 45].map((days) => ({
      householdId: f.id,
      kind: 'task',
      title: 'Done',
      assigneeId: f.space.ownerId,
      completedAt: new Date(time - days * 86400_000),
    })),
    { householdId: f.id, kind: 'task', title: 'Open', assigneeId: f.space.ownerId, completedAt: null },
    {
      householdId: f.id,
      kind: 'event',
      title: 'Not a task',
      assigneeId: f.space.ownerId,
      completedAt: new Date(time),
    },
    {
      householdId: f.id,
      kind: 'task',
      title: 'Archived',
      assigneeId: f.space.ownerId,
      completedAt: new Date(time),
      archivedAt: new Date(time),
    },
  ]);
  for (const [range, done] of [
    ['7', 1],
    ['30', 2],
  ]) {
    const result = await call('/statistics?range=' + range, { auth: f.owner.token });
    assert.deepEqual(result.body.members, [{ id: f.space.ownerId, open: 1, done }]);
  }
  assert.equal(
    (await call('/statistics?range=bad', { auth: f.owner.token })).body.error.code,
    'INVALID_STATISTICS_RANGE',
  );
  required(await call('/statistics?range=all', { auth: f.owner.token }), 'allTimeStatistics');
  await changeManualPro(database, String(f.id), 1, { now });
  assert.equal((await call('/statistics?range=all', { auth: f.owner.token })).body.members[0].done, 3);
});

test('explicit family/account deletion cleans its billing metadata without deleting another family', async () => {
  const f = await family(),
    other = await family();
  await call('/spaces/' + f.id + '/billing/trial', { auth: f.owner.token, body: {} });
  await database.entitlementUsage.insertOne({
    spaceId: f.id,
    feature: 'planningProposals',
    period: '2026-11',
    count: 1,
  });
  const result = await call('/me', {
    auth: f.owner.token,
    method: 'DELETE',
    body: { password: 'billing-test-password', deleteOwnedFamilies: true },
  });
  assert.equal(result.status, 200);
  for (const collection of [database.subscriptions, database.entitlementUsage, database.billingAudit])
    assert.equal(await collection.countDocuments({ spaceId: f.id }), 0);
  assert.equal((await call('/spaces/' + other.id + '/billing', { auth: other.owner.token })).status, 200);
});
