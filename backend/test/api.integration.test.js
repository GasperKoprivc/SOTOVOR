import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';
import { connect } from '../src/db.js';
import { createApi, handleError } from '../src/api.js';

const databaseName = `sotovor_test_${randomUUID().replaceAll('-', '')}`;
let database;
let server;
let apiUrl;

before(async () => {
  process.env.SOTOVOR_MONGO_URI ||= 'mongodb://127.0.0.1:27027';
  process.env.SOTOVOR_DB = databaseName;
  database = await connect();

  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', createApi(database));
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

async function postJson(path, body, cookie) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function dashboard(cookie) {
  const response = await fetch(`${apiUrl}/dashboard`, { headers: { cookie } });
  return { response, data: await response.json() };
}

function sessionCookie(response) {
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
