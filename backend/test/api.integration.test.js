import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';
import { connect } from '../src/db.js';
import { createApi, handleError } from '../src/api.js';
import { versionedErrors } from '../src/api-errors.js';
import { registerAppLinks } from '../src/app-links.js';
import { produceNotifications } from '../src/notifications.js';
import { pushDelivery } from '../src/push.js';
import { createShoppingList } from '../src/shopping.js';
import { createWhatsApp } from '../src/whatsapp.js';

const whatsapp = { secret: 'test-secret', verify: 'test-verify', phoneId: '123' };

const databaseName = `sotovor_test_${randomUUID().replaceAll('-', '')}`;
let database;
let server;
let apiUrl;
const verificationMessages = new Map();
const passwordMessages = new Map();

before(async () => {
  process.env.SOTOVOR_MONGO_URI ||= 'mongodb://127.0.0.1:27027';
  process.env.SOTOVOR_DB = databaseName;
  database = await connect();

  const app = express();
  const shopping = createShoppingList(database);
  app.use('/webhooks/whatsapp', createWhatsApp(database, whatsapp, shopping));
  registerAppLinks(app, { SOTOVOR_ANDROID_FINGERPRINTS: Array(32).fill('AB').join(':') });
  app.use('/api/v1', versionedErrors);
  app.use(express.json({ limit: '8kb' }));
  const options = {
    shopping, whatsappEnabled: true,
    verificationMail: async (email, token, purpose) => (purpose === 'password' ? passwordMessages : verificationMessages).set(email, token),
  };
  app.use('/api/v1', createApi(database, { ...options, versioned: true }));
  app.use('/api', createApi(database, options));
  app.use(handleError);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiUrl = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 30_000 });

after(async () => {
  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  } finally {
    if (database) {
      try {
        await database.client.db(databaseName).dropDatabase();
      } finally {
        await database.client.close();
      }
    }
  }
}, { timeout: 30_000 });

async function postJson(path, body, cookie, household) {
  if (!cookie && ['/households', '/households/join'].includes(path)) {
    const registered = await postJson('/auth/register', {
      firstName: body.memberName, lastName: 'Test', email: `${randomUUID()}@test.invalid`,
      phone: '+38640000111', password: 'integration-test',
    });
    cookie = sessionCookie(registered.response);
    body = { expectedMembers: 4, ...body };
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(household ? { 'x-sotovor-household': household } : {}),
    },
    body: JSON.stringify(body),
  });
  response.cookie = cookie;
  return { response, data: await response.json() };
}

async function dashboard(cookie, household) {
  const headers = { cookie, ...(household ? { 'x-sotovor-household': household } : {}) };
  const response = await fetch(`${apiUrl}/dashboard`, { headers });
  return { response, data: await response.json() };
}

async function v1(path, { method = 'GET', body, access, household, cookie } = {}) {
  const response = await fetch(apiUrl + '/v1' + path, {
    method, headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(access ? { Authorization: 'Bearer ' + access } : {}),
      ...(cookie ? { cookie } : {}),
      ...(household ? { 'x-sotovor-household': household } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

const mobilePost = (path, body, access) => v1(path, { method: 'POST', body, access });

async function nativeUser() {
  const email = `${randomUUID()}@test.invalid`;
  const password = 'integration-test-password';
  const registered = await mobilePost('/auth/register', { firstName: 'Native', lastName: 'Test', email, password, phone: '+38640000111' });
  assert.equal(registered.status, 201);
  const login = await mobilePost('/mobile/auth/login', { email, password, deviceName: 'Pixel test' });
  assert.equal(login.status, 200);
  return { email, ...login.body };
}

test('v1 rotates refresh tokens atomically and revokes access by device and credential', async () => {
  const initial = await nativeUser();
  assert.equal(initial.emailVerificationPending, true);
  const attempts = await Promise.all(Array.from({ length: 2 }, () => mobilePost('/mobile/auth/refresh', { refreshToken: initial.refreshToken })));
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 401]);
  const next = attempts.find(result => result.status === 200).body;
  assert.equal(next.sessionId, initial.sessionId);
  assert.equal((await v1('/dashboard', { access: initial.accessToken })).body.error.code, 'invalid_session');
  const account = await database.accounts.findOne({ email: initial.email });
  const sessions = await v1('/mobile/auth/sessions', { access: next.accessToken });
  assert.equal(sessions.body[0].current, true);
  const record = await database.mobileSessions.findOne({ accountId: account._id });
  assert.equal(record.refreshHash, createHash('sha256').update(next.refreshToken).digest('hex'));
  const removed = await v1('/mobile/auth/sessions/' + next.sessionId, { method: 'DELETE', access: next.accessToken });
  assert.equal(removed.status, 200);
  assert.equal((await mobilePost('/mobile/auth/refresh', { refreshToken: next.refreshToken })).status, 401);
  const relogin = (await mobilePost('/mobile/auth/login', { email: initial.email, password: 'integration-test-password', deviceName: 'Second device' })).body;
  await database.accounts.updateOne({ _id: account._id }, { $set: { passwordHash: 'changed-credential' } });
  assert.equal((await v1('/dashboard', { access: relogin.accessToken })).status, 401);
  assert.equal((await mobilePost('/mobile/auth/refresh', { refreshToken: relogin.refreshToken })).status, 401);
});

test('v1 scopes task pages to the selected household and preserves legacy error responses', async () => {
  const a = await nativeUser();
  const b = await nativeUser();
  const createFamily = user => mobilePost('/households', { householdName: 'Mobile', expectedMembers: 2 }, user.accessToken);
  const home = (await createFamily(a)).body.householdId;
  await createFamily(b);
  for (const title of ['A', 'B', 'C']) {
    assert.equal((await mobilePost('/entries', { title, kind: 'task' }, a.accessToken)).status, 201);
  }
  const first = await v1('/tasks?limit=2', { access: a.accessToken });
  assert.equal(first.body.items.length, 2);
  assert.equal(first.body.items[0].version, 0);
  const second = await v1('/tasks?limit=2&cursor=' + first.body.nextCursor, { access: a.accessToken });
  assert.equal(second.body.items.length, 1);
  assert.equal(second.body.nextCursor, null);
  assert.equal((await v1('/tasks', { access: b.accessToken, household: home })).status, 403);
  assert.equal((await v1('/entries/' + first.body.items[0].id, { access: b.accessToken })).status, 404);
  const legacy = await fetch(apiUrl + '/tasks', { headers: { Authorization: 'Bearer ' + b.accessToken } });
  assert.equal(typeof (await legacy.json()).error, 'string');
  const invalid = await v1('/events?limit=0', { access: a.accessToken });
  assert.equal(invalid.body.error.code, 'invalid_request');
  const filtered = await v1('/tasks?state=available&search=B&assignee=unassigned', { access: a.accessToken });
  assert.deepEqual(filtered.body.items.map(item => item.title), ['B']);
  const due = await v1('/tasks?state=due', { access: a.accessToken });
  assert.equal(due.status, 200);
  assert.equal(due.body.items.length, 0);
  const publicUrl = apiUrl.replace(/\/api$/, '');
  const webFallback = await fetch(publicUrl + '/join/' + 'a'.repeat(32), { redirect: 'manual' });
  assert.equal(webFallback.headers.get('location'), '/?invite=' + 'a'.repeat(32));
  const links = await (await fetch(publicUrl + '/.well-known/assetlinks.json')).json();
  assert.equal(links[0].target.package_name, 'si.sotovor.app');
});

test('account export omits credentials and deletion revokes access and requires owned-space confirmation', async () => {
  const user = await nativeUser();
  const access = user.accessToken;
  const space = await mobilePost('/households', { householdName: 'Delete me', expectedMembers: 2 }, access);
  assert.equal(space.status, 201);
  const exported = await v1('/me/export', { access });
  assert.equal(exported.body.profile.email, user.email);
  assert.equal(JSON.stringify(exported.body).includes('passwordHash'), false);
  const body = { password: 'integration-test-password' };
  assert.equal((await v1('/me', { method: 'DELETE', body, access })).body.error.code, 'owned_families');
  assert.equal((await v1('/me', { method: 'DELETE', body: { ...body, deleteOwnedFamilies: true }, access })).status, 200);
  assert.equal((await v1('/dashboard', { access })).status, 401);
  assert.equal((await mobilePost('/mobile/auth/refresh', { refreshToken: user.refreshToken })).status, 401);
});

test('password reset is single use and revokes native sessions', async () => {
  const user = await nativeUser();
  assert.equal((await mobilePost('/auth/password/request', { email: user.email })).status, 200);
  for (let attempt = 0; attempt < 20 && !passwordMessages.has(user.email); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const token = passwordMessages.get(user.email);
  assert.match(token, /^[a-f0-9]{64}$/);
  const request = { token, password: 'new-password-1234' };
  assert.equal((await mobilePost('/auth/password/reset', request)).status, 200);
  assert.equal((await mobilePost('/auth/password/reset', request)).status, 400);
  assert.equal((await v1('/dashboard', { access: user.accessToken })).status, 401);
  assert.equal((await mobilePost('/mobile/auth/refresh', { refreshToken: user.refreshToken })).status, 401);
  assert.equal((await mobilePost('/mobile/auth/login', { email: user.email, password: request.password, deviceName: 'Pixel' })).status, 200);
});

test('device tokens are scoped, retired by FCM and reminders are deduplicated and configurable', async () => {
  const user = await nativeUser();
  const credentials = user.accessToken;
  const device = { token: 'mock-registration-token', platform: 'android', appVersion: '0.1.0', locale: 'sl' };
  const registered = await mobilePost('/devices', device, credentials);
  assert.equal(registered.status, 200);
  assert.equal((await mobilePost('/devices', device, credentials)).body.id, registered.body.id);
  assert.equal((await mobilePost('/households', { householdName: 'Alerts', expectedMembers: 2 }, credentials)).status, 201);
  const dashboard = (await v1('/dashboard', { access: credentials })).body;
  const family = await database.households.findOne({ inviteCode: dashboard.household.inviteCode });
  const shoppingMessages = [];
  const shoppingPush = pushDelivery(database, async message => shoppingMessages.push(message));
  await shoppingPush.shopping(family);
  assert.equal(shoppingMessages.length, 0);
  await v1('/shopping/push', { method: 'PUT', body: { enabled: true }, access: credentials });
  await shoppingPush.shopping(family, dashboard.memberId);
  assert.equal(shoppingMessages.length, 0);
  await shoppingPush.shopping(family);
  assert.equal(shoppingMessages.length, 1);
  assert.match(shoppingMessages[0].data.deepLink, /^sotovor:\/\/shopping\?/);
  const today = '2040-11-17';
  await mobilePost('/entries', { kind: 'task', title: 'Reminder', dueOn: today, assigneeId: dashboard.memberId, reminderDays: 0 }, credentials);
  const reminder = { today, now: new Date('2040-11-17T10:00:00Z') };
  const quiet = { assignments: false, reminders: false, swaps: true };
  assert.deepEqual((await v1('/me/notification-settings', { method: 'PUT', body: quiet, access: credentials })).body, quiet);
  const sent = [];
  const push = pushDelivery(database, async message => {
    sent.push(message);
    throw Object.assign(new Error(), { code: 'messaging/registration-token-not-registered' });
  });
  await produceNotifications(database, push, reminder);
  assert.equal((await v1('/notifications', { access: credentials })).body.items.length, 0);
  await v1('/me/notification-settings', { method: 'PUT', body: { ...quiet, reminders: true }, access: credentials });
  await Promise.all([produceNotifications(database, push, reminder), produceNotifications(database, push, reminder)]);
  const notices = (await v1('/notifications', { access: credentials })).body.items;
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, 'deadline');
  assert.equal(sent.length, 1);
  assert.match(sent[0].data.deepLink, /^sotovor:\/\/task\?/);
  assert.equal(await database.devices.countDocuments({ token: device.token }), 0);
  await v1('/notifications/' + notices[0].id + '/read', { method: 'PUT', body: {}, access: credentials });
  assert.ok((await v1('/notifications', { access: credentials })).body.items[0].readAt);
  await mobilePost('/mobile/auth/logout', {}, credentials);
  assert.equal((await v1('/dashboard', { access: credentials })).status, 401);
});

test('verification is sent on registration and accepts only a current, single-use token', async () => {
  const email = `${randomUUID()}@test.invalid`;
  const { response } = await postJson('/auth/register', {
    firstName: 'Ana', lastName: 'Test', email, phone: '+38640000111', password: 'integration-test',
  });
  assert.equal(response.status, 201);
  const cookie = sessionCookie(response);
  const token = verificationMessages.get(email);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await dashboard(cookie)).data.profile.emailVerificationPending, true);
  assert.equal((await postJson('/auth/email/resend', {})).response.status, 401);
  assert.equal((await postJson('/auth/email/resend', {}, cookie)).response.status, 429);
  const account = await database.accounts.findOne({ email });
  assert.equal(account.emailVerification.hash, createHash('sha256').update(token).digest('hex'));
  await database.accounts.updateOne({ email }, {
    $set: { 'emailVerification.expiresAt': new Date(0), 'emailVerification.sentAt': new Date(0) },
  });
  assert.equal((await postJson('/auth/email/verify', { token })).response.status, 400);
  assert.equal((await postJson('/auth/email/resend', {}, cookie)).response.status, 200);
  assert.equal((await postJson('/auth/email/verify', { token })).response.status, 400);
  const newToken = verificationMessages.get(email);
  assert.equal((await postJson('/auth/email/verify', { token: newToken })).response.status, 200);
  assert.equal((await postJson('/auth/email/verify', { token: newToken })).response.status, 400);
  assert.equal((await dashboard(cookie)).data.profile.emailVerificationPending, false);
});

test('desktop linking requires browser approval and the original verifier, and can be redeemed once', async () => {
  const { response } = await postJson('/households', { householdName: 'Namizni dom', memberName: 'Ana' });
  const webCookie = sessionCookie(response);
  const verifier = randomBytes(32).toString('hex');
  const challenge = createHash('sha256').update(verifier).digest('hex');
  const started = await postJson('/desktop/start', { challenge });
  assert.equal(started.response.status, 201);
  const { id } = started.data;
  assert.equal((await postJson('/desktop/exchange', { id, verifier })).response.status, 202);
  assert.equal((await postJson('/desktop/approve', { id })).response.status, 401);
  assert.equal((await postJson('/desktop/approve', { id }, webCookie)).response.status, 200);
  assert.equal((await postJson('/desktop/exchange', { id, verifier: '0'.repeat(64) })).response.status, 410);
  const exchanges = await Promise.all([postJson('/desktop/exchange', { id, verifier }), postJson('/desktop/exchange', { id, verifier })]);
  assert.deepEqual(exchanges.map(result => result.response.status).sort(), [200, 410]);
  const success = exchanges.find(result => result.response.ok);
  const desktopCookie = sessionCookie(success.response);
  assert.deepEqual(success.data, { ok: true });
  assert.match(success.response.headers.get('set-cookie'), /HttpOnly/i);
  assert.notEqual(desktopCookie, webCookie);
  assert.equal((await dashboard(desktopCookie)).data.household.name, 'Namizni dom');
  await postJson('/auth/logout', {}, desktopCookie);
  assert.equal((await dashboard(desktopCookie)).data, null);
  assert.equal((await dashboard(webCookie)).data.household.name, 'Namizni dom');
});

test('an existing owner can accept an invitation and keep both spaces', async () => {
  const host = await postJson('/households', { householdName: 'Povabilo', memberName: 'Ana' });
  const visitor = await postJson('/households', { householdName: 'Moj prostor', memberName: 'Boris' });
  const visitorCookie = sessionCookie(visitor.response);
  const { household } = (await dashboard(sessionCookie(host.response))).data;
  const invalid = await postJson('/households/join', { inviteCode: '0'.repeat(32) }, visitorCookie);
  assert.equal(invalid.response.status, 404);
  const accepted = await postJson('/households/join', { inviteCode: household.inviteCode.toUpperCase() }, visitorCookie);
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.data.householdId, household.id);
  const selected = (await dashboard(visitorCookie, household.id)).data;
  assert.equal(selected.spaces.length, 2);
  assert.equal(selected.admin, false);
  assert.equal((await dashboard(visitorCookie, visitor.data.householdId)).data.admin, true);
  assert.equal((await postJson('/households/join', { inviteCode: household.inviteCode }, visitorCookie)).response.status, 409);
});

test('owners can create and switch between isolated family spaces', async () => {
  const first = await postJson('/households', { householdName: 'Prvi dom', memberName: 'Ana' });
  const owner = sessionCookie(first.response);
  const second = await postJson('/households', { householdName: 'Drugi dom', expectedMembers: 3 }, owner);
  assert.equal(second.response.status, 201);
  const id = second.data.householdId;
  const selected = (await dashboard(owner, id)).data;
  assert.equal(selected.admin, true);
  assert.equal(selected.spaces.length, 2);
  assert.equal(selected.household.name, 'Drugi dom');
  const joined = await postJson('/households/join', { memberName: 'Luka', inviteCode: selected.household.inviteCode });
  const member = sessionCookie(joined.response);
  assert.equal((await dashboard(member, first.data.householdId)).response.status, 403);
  assert.equal((await postJson('/households', { householdName: 'Obvoz', expectedMembers: 1 }, member)).response.status, 409);
  const added = await postJson('/entries', { kind: 'task', title: 'Samo v drugem domu' }, owner, id);
  assert.equal(added.response.status, 201);
  assert.equal((await dashboard(owner)).data.entries.length, 0);
  assert.equal((await dashboard(member, id)).data.entries.length, 1);
});

test('smart planning excludes sick members, uses child roles and checks the preview before applying', async () => {
  const created = await postJson('/households', { householdName: 'Razpored', memberName: 'Ana' });
  const owner = sessionCookie(created.response);
  const initial = (await dashboard(owner)).data;
  const inviteCode = initial.household.inviteCode;
  const sick = sessionCookie((await postJson('/households/join', { memberName: 'Luka', inviteCode })).response);
  const child = sessionCookie((await postJson('/households/join', { memberName: 'Ema', inviteCode })).response);
  const sickId = (await dashboard(sick)).data.memberId;
  const childId = (await dashboard(child)).data.memberId;
  const position = id => '/households/members/' + id + '/planning';

  const settings = { familyRole: 'child', availability: 'sick' };
  assert.equal((await postJson(position(sickId), settings, sick)).response.status, 403);
  assert.equal((await postJson(position(sickId), { ...settings, unavailableUntil: '2026-02-30' }, owner)).response.status, 400);
  assert.equal((await postJson(position(sickId), settings, owner)).response.status, 200);
  assert.equal((await postJson(position(childId), { familyRole: 'child', availability: 'available' }, owner)).response.status, 200);
  assert.equal((await dashboard(child)).data.members.find(person => person.id === sickId).availability, undefined);
  assert.equal((await postJson('/planning/preview', {}, child)).response.status, 403);

  await postJson('/entries', { kind: 'task', title: 'Zdravnik', category: 'zdravje', assigneeId: sickId }, owner);
  await postJson('/entries', { kind: 'task', title: 'Zalij rože', category: 'dom' }, owner);
  let preview = (await postJson('/planning/preview', {}, owner)).data;
  assert.deepEqual(preview.changes.map(item => [item.title, item.assigneeName]), [['Zdravnik', 'Ana Test'], ['Zalij rože', 'Ema Test']]);
  assert.equal((await dashboard(owner)).data.entries.find(entry => entry.title === 'Zdravnik').assigneeId, sickId);
  await postJson('/entries', { kind: 'task', title: 'Nakup', category: 'opravki' }, owner);
  assert.equal((await postJson('/planning/apply', { signature: preview.signature }, owner)).response.status, 409);
  preview = (await postJson('/planning/preview', {}, owner)).data;
  const applied = await postJson('/planning/apply', { signature: preview.signature }, owner);
  assert.deepEqual(applied.data, { applied: 3, conflicts: 0 });
  const entries = (await dashboard(owner)).data.entries;
  assert.equal(entries.find(entry => entry.title === 'Zdravnik').assigneeId, initial.memberId);
  assert.equal(entries.find(entry => entry.title === 'Zalij rože').assigneeId, childId);
  assert.equal(entries.find(entry => entry.title === 'Nakup').assigneeId, initial.memberId);
});

function sessionCookie(response) {
  if (response.cookie) return response.cookie;
  const cookie = response.headers.getSetCookie()
    .find(value => value.startsWith('sotovor_session='))
    ?.split(';', 1)[0];
  assert.match(cookie ?? '', /^sotovor_session=[a-f0-9]{64}$/);
  return cookie;
}

test('a household member can claim an unassigned task through the API', { timeout: 30_000 }, async () => {
  const createdHousehold = await postJson('/households', {
    householdName: 'CI household',
    memberName: 'Ana',
  });
  assert.equal(createdHousehold.response.status, 201);
  const ownerCookie = sessionCookie(createdHousehold.response);
  const ownerDashboard = await dashboard(ownerCookie);
  assert.equal(ownerDashboard.response.status, 200);

  const joined = await postJson('/households/join', {
    inviteCode: ownerDashboard.data.household.inviteCode,
    memberName: 'Boris',
  });
  assert.equal(joined.response.status, 201);
  const memberCookie = sessionCookie(joined.response);
  const memberDashboard = await dashboard(memberCookie);
  assert.equal(memberDashboard.response.status, 200);
  assert.notEqual(memberDashboard.data.memberId, ownerDashboard.data.memberId);

  const createdTask = await postJson('/entries', {
    kind: 'task',
    title: 'CI claim task',
  }, ownerCookie);
  assert.equal(createdTask.response.status, 201);
  const task = createdTask.data.entries.find(entry => entry.title === 'CI claim task');
  assert.ok(task);
  assert.equal(task.assigneeId, null);

  const claimed = await postJson(`/tasks/${task.id}/claim`, {}, memberCookie);
  assert.equal(claimed.response.status, 200);
  const claimedTask = claimed.data.entries.find(entry => entry.id === task.id);
  assert.equal(claimedTask.assigneeId, memberDashboard.data.memberId);

  const competingClaim = await postJson(`/tasks/${task.id}/claim`, {}, ownerCookie);
  assert.equal(competingClaim.response.status, 409);
});

test('completion creates exactly one recurring task and rotates its assignee', async () => {
  const created = await postJson('/households', { householdName: 'Rotacija', memberName: 'Ana' });
  const owner = sessionCookie(created.response);
  const initial = (await dashboard(owner)).data;
  const joined = await postJson('/households/join', {
    inviteCode: initial.household.inviteCode, memberName: 'Boris',
  });
  const nextMember = (await dashboard(sessionCookie(joined.response))).data.memberId;
  const added = await postJson('/entries', {
    kind: 'task', title: 'Prevzem', dueOn: '2026-12-29',
    assigneeId: initial.memberId, repeatDays: 7, rotate: true, reminderDays: 3,
  }, owner);
  assert.equal(added.response.status, 201);
  const path = `/tasks/${added.data.entries[0].id}/complete`;
  const results = await Promise.all([postJson(path, {}, owner), postJson(path, {}, owner)]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  const { entries } = (await dashboard(owner)).data;
  assert.equal(entries.length, 2);
  const next = entries.find(entry => !entry.completedAt);
  assert.equal(next.dueOn, '2027-01-05');
  assert.equal(next.assigneeId, nextMember);
  assert.equal(next.reminderDays, 3);
});

test('voice notes are stored and accessible only within their household', async () => {
  const owner = sessionCookie((await postJson('/households', { householdName: 'Zvok', memberName: 'Ana' })).response);
  const other = sessionCookie((await postJson('/households', { householdName: 'Drugi', memberName: 'Jan' })).response);
  const bytes = Buffer.from('1a45dfa30000', 'hex');
  const added = await postJson('/entries', {
    kind: 'task', title: 'Glas', voice: { mime: 'audio/webm', data: bytes.toString('base64') },
  }, owner);
  assert.equal(added.response.status, 201);
  const [task] = added.data.entries;
  assert.deepEqual(task.voice, { mime: 'audio/webm' });
  const url = `${apiUrl}/entries/${task.id}/voice`;
  assert.equal((await fetch(url, { headers: { cookie: other } })).status, 404);
  const audio = await fetch(url, { headers: { cookie: owner } });
  assert.equal(audio.headers.get('content-type'), 'audio/webm');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), bytes);
});

test('signed WhatsApp webhooks pair a sender and import each message once', async () => {
  const owner = sessionCookie((await postJson('/households', { householdName: 'WhatsApp', memberName: 'Ana' })).response);
  const { data: { code } } = await postJson('/whatsapp/pair', {}, owner);
  const url = new URL('/webhooks/whatsapp', apiUrl);
  assert.equal(await (await fetch(url + '?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=42')).text(), '42');

  async function send(id, body, secret = whatsapp.secret) {
    const json = JSON.stringify({
      object: 'whatsapp_business_account', entry: [{ changes: [{
        field: 'messages', value: {
          metadata: { phone_number_id: whatsapp.phoneId },
          messages: [{ id, type: 'text', from: '38640123456', text: { body } }],
        },
      }] }],
    });
    const signature = createHmac('sha256', secret).update(json).digest('hex');
    return (await fetch(url, {
      method: 'POST', body: json,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + signature },
    })).status;
  }

  assert.equal(await send('pair', 'poveži ' + code, 'wrong'), 403);
  assert.equal(await send('pair', 'poveži ' + code), 200);
  const event = 'dogodek 2027-02-10 Kosilo';
  assert.equal(await send('event', event), 200);
  assert.equal(await send('event', event), 200);
  const result = (await dashboard(owner)).data;
  assert.equal(result.whatsapp.linked, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].title, 'Kosilo');
  assert.equal(result.entries[0].dueOn, '2027-02-10');
  assert.equal(await send('shopping', 'nakup mleko'), 200);
  assert.equal(await send('shopping', 'nakup mleko'), 200);
  const headers = { cookie: owner };
  const list = async () => (await fetch(apiUrl + '/shopping', { headers })).json();
  const [milk] = await list();
  assert.equal(milk.title, 'mleko');
  assert.equal((await list()).length, 1);
  assert.equal((await fetch(apiUrl + '/shopping/' + milk.id, { method: 'DELETE', headers })).status, 200);
  assert.equal(await send('shopping', 'nakup mleko'), 200);
  assert.deepEqual(await list(), []);

  assert.equal((await postJson('/whatsapp/unlink', {}, owner)).response.status, 200);
  assert.equal(await send('after-unlink', 'Opravilo'), 200);
  assert.equal((await dashboard(owner)).data.entries.length, 1);
});

test('entries can be edited and removed with stale-write protection', async () => {
  const owner = sessionCookie((await postJson('/households', { householdName: 'Urejanje', memberName: 'Ana' })).response);
  const fields = { kind: 'event', title: 'Kosilo', dueOn: '2027-02-10' };
  const { data } = await postJson('/entries', fields, owner);
  const path = '/entries/' + data.entries[0].id;
  const edited = await postJson(path + '/edit', { ...fields, title: 'Večerja', version: 0 }, owner);
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.entries[0].title, 'Večerja');
  assert.equal((await postJson(path + '/remove', { version: 0 }, owner)).response.status, 409);
  const removed = await postJson(path + '/remove', { version: 1 }, owner);
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.data.entries, []);
});

test('accounts cannot switch households and only the owner can approve leaving or change permissions', async () => {
  const owner = sessionCookie((await postJson('/households', { householdName: 'Pravice', memberName: 'Ana' })).response);
  const original = (await dashboard(owner)).data;
  const member = sessionCookie((await postJson('/households/join', {
    memberName: 'Boris', inviteCode: original.household.inviteCode,
  })).response);
  const current = (await dashboard(member)).data;
  const memberPath = '/households/members/' + current.memberId;
  assert.equal(current.household.inviteCode, undefined);
  assert.equal((await postJson('/households', { householdName: 'Nov' }, member)).response.status, 409);
  assert.equal((await postJson(memberPath + '/remove', {}, member)).response.status, 403);
  const fields = { kind: 'task', title: 'Pospravi', dueOn: '2027-02-10' };
  const { data } = await postJson('/entries', fields, owner);
  const path = '/entries/' + data.entries[0].id + '/edit';
  assert.equal((await postJson(path, { ...fields, version: 0 }, member)).response.status, 403);
  assert.equal((await postJson(memberPath + '/permissions', {
    create: false, edit: false, move: true, remove: false,
  }, owner)).response.status, 200);
  assert.equal((await postJson('/entries', fields, member)).response.status, 403);
  assert.equal((await postJson(path, { ...fields, title: 'Drugo', version: 0 }, member)).response.status, 403);
  assert.equal((await postJson(path, { ...fields, dueOn: '2027-02-11', version: 0 }, member)).response.status, 200);
  assert.equal((await postJson('/households/leave', {}, member)).response.status, 200);
  assert.equal((await dashboard(member)).data.leaveRequested, true);
  assert.equal((await postJson(memberPath + '/remove', {}, owner)).response.status, 200);
  assert.equal((await dashboard(member)).data.household, null);
});

test('shopping state is family scoped, preserves buyer attribution, and invalidates connected web clients', async () => {
  const registered = await postJson('/households', { householdName: 'Nakupi', memberName: 'Owner' });
  const owner = sessionCookie(registered.response);
  const { householdId } = registered.data;
  const { data: board } = await dashboard(owner, householdId);
  const joined = await postJson('/households/join', { inviteCode: board.household.inviteCode, memberName: 'Buyer' });
  assert.equal(joined.response.status, 201);
  const buyerScope = { cookie: sessionCookie(joined.response), household: householdId };
  const scope = { cookie: owner, household: householdId };
  const other = sessionCookie((await postJson('/households', { householdName: 'Other', memberName: 'Other' })).response);
  const stream = await fetch(apiUrl + '/v1/shopping/stream?household=' + householdId, {
    headers: { cookie: owner }, signal: AbortSignal.timeout(5000),
  });
  assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    assert.match((await reader.read()).value, /event: refresh/);
    assert.equal((await v1('/shopping', { ...scope, method: 'POST', body: { title: '   ' } })).status, 400);
    const added = await v1('/shopping', { ...scope, method: 'POST', body: { title: 'Jabolka', quantity: ' 2 kg ' } });
    assert.equal(added.status, 201);
    assert.equal(added.body.quantity, '2 kg');
    assert.match((await reader.read()).value, /event: refresh/);
    const path = '/shopping/' + added.body.id;
    const check = { method: 'PUT', body: { checked: true } };
    assert.equal((await v1('/shopping', { cookie: other, household: householdId })).status, 403);
    assert.equal((await v1(path, { ...buyerScope, ...check })).body.checkedByName, 'Buyer Test');
    assert.equal((await v1(path, { ...scope, ...check })).body.checkedByName, 'Buyer Test');
    const reset = await v1(path, { ...scope, method: 'PUT', body: { checked: false } });
    assert.equal(reset.body.checkedByName, null);
    assert.equal(reset.body.checkedAt, null);
    assert.deepEqual((await v1('/shopping/push', buyerScope)).body, { enabled: false });
    assert.deepEqual((await v1('/shopping/push', { ...buyerScope, method: 'PUT', body: { enabled: true } })).body, { enabled: true });
    assert.deepEqual((await v1('/shopping/push', scope)).body, { enabled: false });
    assert.equal((await v1(path, { ...scope, method: 'DELETE' })).status, 200);
    assert.deepEqual((await v1('/shopping', buyerScope)).body, []);
  } finally {
    await reader.cancel();
  }
});
