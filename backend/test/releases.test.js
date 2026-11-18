import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { registerReleases } from '../src/releases.js';

const repo = 'example/sotovor';
const digest = 'a'.repeat(64);
const win = 'Sotovor-0.1.0-windows-x64-setup.exe';
const apk = 'Sotovor-0.1.0-unsigned.apk';
const cdn = 'https://release-assets.githubusercontent.com/rehearsal';
const publishedAt = '2026-11-18T12:00:00Z';

async function host(t, options) {
  const app = express();
  registerReleases(app, { repo, ...options });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

test('public release metadata is cached and proxies only approved private assets without leaking credentials', async (t) => {
  let calls = 0;
  const asset = (id, name) => ({ id, name, size: 7, state: 'uploaded', digest: 'sha256:' + digest });
  const token = 'test-github-secret';
  const url = await host(t, {
    token,
    async fetcher(input, options) {
      if (input.endsWith('/latest')) {
        calls++;
        assert.equal(options.headers.Authorization, 'Bearer ' + token);
        return Response.json({
          tag_name: 'v0.1.0',
          published_at: publishedAt,
          body: '<!-- sotovor-windows-authenticode -->',
          assets: [asset(1, win), asset(2, apk), asset(3, 'latest.json'), asset(4, 'private-debug.map')],
        });
      }
      if (input.endsWith('/assets/1')) {
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers.Authorization, 'Bearer ' + token);
        return Response.redirect(cdn, 302);
      }
      if (input === cdn) {
        assert.equal(options.headers.Authorization, undefined);
        return new Response('payload');
      }
      throw new Error('Unexpected upstream request');
    },
  });
  const meta = await (await fetch(url + '/api/releases/latest')).json();
  assert.deepEqual(meta, {
    version: '0.1.0',
    publishedAt,
    playUrl: null,
    downloads: {
      windows: { url: '/download/releases/v0.1.0/' + win, sha256: digest, size: 7, signed: true },
    },
  });
  const updater = await fetch(url + '/download/latest.json', { redirect: 'manual' });
  assert.equal(updater.headers.get('location'), '/download/releases/v0.1.0/latest.json');
  const redirect = await fetch(url + '/download/windows', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), meta.downloads.windows.url);
  const file = await fetch(url + redirect.headers.get('location'));
  assert.equal(file.headers.get('content-disposition'), 'attachment; filename="' + win + '"');
  assert.equal(await file.text(), 'payload');
  for (const path of [
    '/download/android',
    '/download/releases/v0.1.0/' + apk,
    '/download/releases/v0.1.0/private-debug.map',
  ]) {
    assert.equal((await fetch(url + path)).status, 404);
  }
  assert.equal(calls, 1);
});

test('static fallback supplies clear download information during a GitHub outage', async (t) => {
  const target = 'https://downloads.example.test/sotovor.apk';
  const fallback = {
    version: '0.1.0',
    publishedAt,
    downloads: { android: { url: target, sha256: digest, size: 7, signed: true } },
  };
  const url = await host(t, {
    fallback,
    fetcher: () => {
      return Promise.reject(new Error('offline'));
    },
  });
  const release = await (await fetch(url + '/api/releases/latest')).json();
  assert.equal(release.downloads.android.url, target);
  assert.equal(
    (await fetch(url + '/download/android', { redirect: 'manual' })).headers.get('location'),
    target,
  );
});

test('a private asset refuses unexpected hosts instead of forwarding the GitHub token', async (t) => {
  const url = await host(t, {
    token: 'do-not-forward',
    fetcher: async (input) => {
      if (input.endsWith('/latest'))
        return Response.json({
          tag_name: 'v0.1.0',
          published_at: publishedAt,
          assets: [{ id: 1, name: win, size: 7, state: 'uploaded', digest: 'sha256:' + digest }],
        });
      if (input.endsWith('/assets/1'))
        return Response.redirect('https://unapproved.example.test/request', 302);
      assert.fail('The unapproved CDN host was called');
    },
  });
  assert.equal((await fetch(url + '/download/windows')).status, 502);
});
