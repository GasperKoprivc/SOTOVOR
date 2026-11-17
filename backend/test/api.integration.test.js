import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';
import { connect } from '../src/db.js';
import { createApi, handleError } from '../src/api.js';
import { createWhatsApp } from '../src/whatsapp.js';

const whatsapp = { secret: 'test-secret', verify: 'test-verify', phoneId: '123' };

const databaseName = `sotovor_test_${randomUUID().replaceAll('-', '')}`;
let database;
let server;
let apiUrl;

before(async () => {
  process.env.SOTOVOR_MONGO_URI ||= 'mongodb://127.0.0.1:27027';
  process.env.SOTOVOR_DB = databaseName;
  database = await connect();

  const app = express();
  app.use('/webhooks/whatsapp', createWhatsApp(database, whatsapp));
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', createApi(database, { whatsappEnabled: true }));
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
