import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test(
  'start.bat installs, builds and reuses a running app from a clean checkout',
  {
    skip: process.platform !== 'win32',
    timeout: 240_000,
  },
  async (t) => {
    const copy = mkdtempSync(join(tmpdir(), 'sotovor-windows-start-'));
    // Copy only launcher inputs; never copy local secrets, databases or native build caches.
    const excluded = new Set(['node_modules', 'dist', '.env', 'build', 'target']);
    for (const name of ['package.json', 'package-lock.json', 'start.bat', 'backend', 'frontend', 'scripts']) {
      cpSync(join(root, name), join(copy, name), {
        recursive: true,
        filter: (source) => !excluded.has(basename(source)),
      });
    }
    t.after(() => rmSync(copy, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
    assert.equal(existsSync(join(copy, 'node_modules')), false);
    let requests = 0;
    const server = createServer((request, response) => {
      if (request.url === '/api/health') {
        requests += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ service: 'sotovor' }));
      } else {
        response.writeHead(404).end();
      }
    });
    t.after(() => new Promise((done) => server.close(done)));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start.bat'], {
      cwd: copy,
      env: {
        ...process.env,
        SOTOVOR_NO_BROWSER: '1',
        SOTOVOR_WEB_ONLY: '1',
        SOTOVOR_DESKTOP: '0',
        SOTOVOR_PORT: String(server.address().port),
      },
      windowsHide: true,
      timeout: 210_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, output);
    assert.equal(requests, 1, output);
    assert.ok(existsSync(join(copy, 'frontend/dist/index.html')), output);
    assert.ok(existsSync(join(copy, 'node_modules/.sotovor-package-lock')), output);
  },
);
