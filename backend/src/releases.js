import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const versions = /^v(\d+\.\d+\.\d+)$/;
const sha256 = /^[a-f0-9]{64}$/i;
const platforms = ['windows', 'android', 'macos', 'linux'];

function assetNames(version) {
  return {
    windows: `Sotovor-${version}-windows-x64-setup.exe`,
    android: `Sotovor-${version}.apk`,
    macos: `Sotovor-${version}-macos.dmg`,
    linux: `Sotovor-${version}-linux.AppImage`,
  };
}

function releaseShape(release) {
  const version = versions.exec(release?.tag_name)?.[1];
  if (!version || release.draft || release.prerelease || !Number.isFinite(Date.parse(release.published_at)))
    return null;
  const names = assetNames(version);
  const allowed = new Set([...Object.values(names), 'latest.json', 'SHA256SUMS.txt']);
  const assets = new Map(
    (release.assets ?? [])
      .filter(
        (asset) =>
          allowed.has(asset.name) &&
          Number.isSafeInteger(asset.id) &&
          asset.id > 0 &&
          asset.state === 'uploaded' &&
          Number.isSafeInteger(asset.size) &&
          asset.size > 0,
      )
      .map((asset) => [asset.name, asset]),
  );
  return {
    version,
    names,
    tag: release.tag_name,
    assets,
    publishedAt: release.published_at,
    windowsSigned: (release.body ?? '').includes('<!-- sotovor-windows-authenticode -->'),
  };
}

function staticRelease(fallback) {
  const version = versions.exec('v' + fallback?.version)?.[1];
  if (!version || !Number.isFinite(Date.parse(fallback.publishedAt))) return null;
  const downloads = {};
  for (const platform of platforms) {
    const asset = fallback.downloads?.[platform];
    const url = URL.parse(asset?.url ?? '');
    if (
      url?.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      sha256.test(asset?.sha256) &&
      Number.isSafeInteger(asset.size) &&
      asset.size > 0
    ) {
      downloads[platform] = {
        url: url.href,
        sha256: asset.sha256,
        size: asset.size,
        signed: asset.signed === true,
      };
    }
  }
  return { version, publishedAt: fallback.publishedAt, downloads };
}

export async function releaseConfiguration(env = process.env) {
  const repo = env.SOTOVOR_RELEASE_REPOSITORY || 'GasperKoprivc/SOTOVOR';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid SOTOVOR_RELEASE_REPOSITORY.');
  const play = URL.parse(env.SOTOVOR_GOOGLE_PLAY_URL || '');
  if (
    env.SOTOVOR_GOOGLE_PLAY_URL &&
    (play?.origin !== 'https://play.google.com' || play.username || play.password)
  ) {
    throw new Error('SOTOVOR_GOOGLE_PLAY_URL must point to Google Play.');
  }
  return {
    repo,
    token: env.SOTOVOR_RELEASE_GITHUB_TOKEN,
    playUrl: play?.href ?? null,
    fallback: env.SOTOVOR_RELEASE_FALLBACK_JSON
      ? JSON.parse(env.SOTOVOR_RELEASE_FALLBACK_JSON)
      : env.SOTOVOR_RELEASE_FALLBACK_FILE
        ? JSON.parse(await readFile(env.SOTOVOR_RELEASE_FALLBACK_FILE, 'utf8'))
        : null,
  };
}

export function registerReleases(
  app,
  { repo, token, playUrl = null, fallback, fetcher = fetch, clock = Date.now, ttl = 600_000 },
) {
  const upstream = `https://api.github.com/repos/${repo}/releases`;
  const staticData = staticRelease(fallback);
  const headers = {
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  };
  const retained = new Map();
  let cached = null;
  let expires = 0;
  let pending;

  async function openAsset(asset, signal, range) {
    const rangeHeaders = { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) };
    let reply = await fetcher(upstream + '/assets/' + asset.id, {
      headers: { ...headers, ...rangeHeaders, Accept: 'application/octet-stream' },
      signal,
      redirect: 'manual',
    });
    if (reply.status === 302) {
      const location = URL.parse(reply.headers.get('location') ?? '');
      if (location?.protocol !== 'https:' || !location.hostname.endsWith('.githubusercontent.com')) {
        throw new Error('Unexpected release asset host');
      }
      await reply.body?.cancel();
      reply = await fetcher(location.href, { signal, headers: rangeHeaders, redirect: 'error' });
    }
    return reply;
  }

  async function probe() {
    const response = await fetcher(upstream + '/latest', {
      headers: { ...headers, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('GitHub release unavailable');
    const release = releaseShape(await response.json());
    if (!release) return staticData;
    const sums = new Map();
    const checksum = release.assets.get('SHA256SUMS.txt');
    if (checksum && checksum.size <= 16384) {
      try {
        const response = await openAsset(checksum, AbortSignal.timeout(5000));
        if (response.ok) {
          for (const line of (await response.text()).split(/\r?\n/)) {
            const match = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line);
            if (match) sums.set(match[2], match[1].toLowerCase());
          }
        }
      } catch {
        /* GitHub's per-asset digest can also supply the checksum. */
      }
    }
    const downloads = {};
    for (const [platform, name] of Object.entries(release.names)) {
      const asset = release.assets.get(name);
      if (!asset) continue;
      const digest = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : sums.get(name);
      if (!sha256.test(digest)) continue;
      downloads[platform] = {
        url: `/download/releases/${release.tag}/${name}`,
        size: asset.size,
        sha256: digest.toLowerCase(),
        signed: platform === 'android' || (platform === 'windows' && release.windowsSigned),
      };
    }
    retained.set(release.tag, release);
    if (retained.size > 3) retained.delete(retained.keys().next().value);
    return {
      version: release.version,
      publishedAt: release.publishedAt,
      downloads,
      updater: release.assets.has('latest.json') ? `/download/releases/${release.tag}/latest.json` : null,
    };
  }

  function latest() {
    if (clock() < expires) return Promise.resolve(cached);
    pending ??= probe()
      .then((data) => data ?? cached ?? staticData)
      .catch(() => cached ?? staticData)
      .then((data) => {
        cached = data;
        expires = clock() + (data ? ttl : Math.min(ttl, 60_000));
        return data;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  app.get('/api/releases/latest', async (_req, res) => {
    const release = await latest();
    res.set('Cache-Control', 'public, max-age=60').json({
      version: release?.version ?? null,
      publishedAt: release?.publishedAt ?? null,
      downloads: release?.downloads ?? {},
      playUrl,
    });
  });

  app.get('/download/:platform', async (req, res) => {
    const platform = req.params.platform;
    if (!platforms.includes(platform) && platform !== 'latest.json') return res.sendStatus(404);
    const release = await latest();
    const url = platform === 'latest.json' ? release?.updater : release?.downloads[platform]?.url;
    res.set('Cache-Control', 'no-store');
    return url ? res.redirect(302, url) : res.sendStatus(404);
  });

  app.get('/download/releases/:tag/:name', async (req, res) => {
    const { tag, name } = req.params;
    const version = versions.exec(tag)?.[1];
    if (!version || ![...Object.values(assetNames(version)), 'latest.json'].includes(name))
      return res.sendStatus(404);
    if (!retained.has(tag)) await latest();
    const asset = retained.get(tag)?.assets.get(name);
    if (!asset) return res.sendStatus(404);
    const controller = new AbortController();
    const stop = () => controller.abort();
    res.once('close', stop);
    try {
      const range = /^bytes=\d*-\d*$/.test(req.get('range') ?? '') ? req.get('range') : undefined;
      const reply = await openAsset(
        asset,
        AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
        range,
      );
      if (reply.status === 416) return res.sendStatus(416);
      if (!reply.ok || !reply.body) return res.sendStatus(502);
      res
        .status(reply.status)
        .set('Content-Type', name === 'latest.json' ? 'application/json' : 'application/octet-stream');
      for (const field of ['content-length', 'content-range', 'accept-ranges']) {
        const value = reply.headers.get(field);
        if (value) res.set(field, value);
      }
      res.set('Cache-Control', 'public, max-age=86400, immutable');
      if (name !== 'latest.json') res.set('Content-Disposition', `attachment; filename="${name}"`);
      if (req.method === 'HEAD') {
        await reply.body.cancel();
        return res.end();
      }
      await pipeline(Readable.fromWeb(reply.body), res);
    } catch {
      if (!controller.signal.aborted && !res.headersSent) res.sendStatus(502);
    } finally {
      res.off('close', stop);
    }
  });
}
