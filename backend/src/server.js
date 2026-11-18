import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import { createApi, handleError } from './api.js';
import { createWhatsApp, whatsappConfig } from './whatsapp.js';
import { smtpVerification } from './email-verification.js';
import { versionedErrors } from './api-errors.js';
import { registerAppLinks } from './app-links.js';
import { transcriptionProvider } from './transcription.js';
import { configurePush } from './push.js';
import { scheduleNotifications } from './notifications.js';
import { registerReleases, releaseConfiguration } from './releases.js';

import { createShoppingList } from './shopping.js';

const host = process.env.SOTOVOR_HOST || '127.0.0.1';
const port = Number(process.env.SOTOVOR_PORT || 3000);
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const verificationMail = smtpVerification();
const database = await connect();
const push = await configurePush(database);
const shopping = createShoppingList(database, push.shopping);
const app = express();
app.disable('x-powered-by');
if (process.env.SOTOVOR_TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:",
  );
  next();
});
const whatsapp = whatsappConfig();
registerAppLinks(app);
registerReleases(app, await releaseConfiguration());
app.use('/api/v1', versionedErrors);
app.get('/healthz', (_req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await database.client.db().command({ ping: 1 }, { timeoutMS: 2000 });
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
app.get(['/api/health', '/api/v1/health'], (_req, res) =>
  res.json({ service: 'sotovor', desktopAuth: true, desktopCookie: true }),
);
if (whatsapp) app.use('/webhooks/whatsapp', createWhatsApp(database, whatsapp, shopping));
if (process.env.SOTOVOR_REQUIRE_SMTP === '1') {
  app.post(
    ['/api/auth/register', '/api/v1/auth/register'],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Preveč poskusov registracije. Poskusi pozneje.' },
    }),
  );
}
app.post(['/api/entries', '/api/v1/entries'], express.json({ limit: '3mb' }));
const apiOptions = {
  shopping,
  push,
  transcription: transcriptionProvider(),
  whatsappEnabled: Boolean(whatsapp),
  verificationMail,
};
const json = express.json({ limit: '8kb' });
app.use(
  '/api/v1',
  json,
  createApi(database, {
    ...apiOptions,
    versioned: true,
    mobileOptions: {
      accessSeconds: Number(process.env.SOTOVOR_MOBILE_ACCESS_SECONDS ?? 600),
      minSupported: process.env.SOTOVOR_ANDROID_MIN_VERSION,
      latest: process.env.SOTOVOR_ANDROID_LATEST_VERSION,
    },
  }),
);
app.use('/api', json, createApi(database, apiOptions));
app.get('/prenesi', (_req, res) => res.sendFile('index.html', { root: dist }));
app.use(express.static(dist));
app.use(handleError);

const server = app.listen(port, host);
const stopNotifications = scheduleNotifications(database, push);
server.once('listening', () => {
  const address = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${address.includes(':') ? `[${address}]` : address}:${server.address().port}`;
  console.log(`Sotovor teče na ${url}`);
  process.send?.({ ready: true, port: server.address().port });
  console.log('Za ustavitev pritisni Ctrl+C.');
});
server.once('error', async (error) => {
  stopNotifications();
  console.error(error.code === 'EADDRINUSE' ? `Vrata ${port} so že v uporabi.` : error.message);
  await database.client.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopNotifications();
    server.close(() => void database.client.close());
  });
}
