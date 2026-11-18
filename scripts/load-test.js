import autocannon from 'autocannon';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:3060';
const email = `load-${randomUUID()}@test.invalid`;
const password = 'Disposable-load-test-231';
async function post(path, body, token) {
  const response = await fetch(origin + '/api/v1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}
await post('/auth/register', { firstName: 'Load', lastName: 'Test', email, phone: '+38640000111', password });
const { accessToken } = await post('/mobile/auth/login', { email, password, deviceName: 'Load test' });
await post('/households', { householdName: 'Load test', expectedMembers: 4 }, accessToken);
for (let i = 0; i < 30; i++) await post('/entries', { kind: 'task', title: `Load task ${i}` }, accessToken);
const results = [];
try {
  for (const path of [
    '/api/releases/latest',
    '/api/v1/dashboard?includeEntries=false',
    '/api/v1/tasks',
    '/api/v1/shopping',
  ]) {
    const result = await autocannon({
      url: origin + path,
      connections: 10,
      duration: 10,
      headers: path.startsWith('/api/v1') ? { Authorization: 'Bearer ' + accessToken } : {},
    });
    const row = {
      path,
      requests: result.requests.total,
      requestsPerSecond: result.requests.average,
      latencyP50: result.latency.p50,
      latencyP99: result.latency.p99,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
    };
    results.push(row);
    console.log(row);
    if (row.errors || row.timeouts || row.non2xx) process.exitCode = 1;
  }
} finally {
  const response = await fetch(origin + '/api/v1/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({ password, deleteOwnedFamilies: true }),
  });
  if (!response.ok) {
    console.error('Load fixture cleanup failed.');
    process.exitCode = 1;
  }
}
await mkdir('quality-results', { recursive: true });
await writeFile(
  'quality-results/load.json',
  JSON.stringify(
    { origin, node: process.version, connections: 10, secondsPerEndpoint: 10, tasks: 30, results },
    null,
    2,
  ),
);
