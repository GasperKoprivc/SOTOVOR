import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excludedNames = new Set(['.git', '.env', 'data', 'dist', 'node_modules']);

test('Windows launcher installs and builds from a fresh copy without node_modules', { timeout: 120_000 }, async () => {
  const copy = mkdtempSync(join(tmpdir(), 'sotovor-windows-start-'));
  cpSync(root, copy, {
    recursive: true,
    filter: source => !excludedNames.has(basename(source)),
  });
  assert.equal(existsSync(join(copy, 'node_modules')), false);

  let healthRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      healthRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ service: 'sotovor' }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  let output = '';
  let child;
  try {
    child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start.bat'], {
      cwd: copy,
      env: {
        ...process.env,
        SOTOVOR_NO_BROWSER: '1',
        SOTOVOR_PORT: String(server.address().port),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, output);
    assert.match(output, /Sotovor že teče na http:\/\/127\.0\.0\.1:/);
    assert.equal(healthRequests, 1);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose());
    });
    rmSync(copy, { recursive: true, force: true });
  }
});
