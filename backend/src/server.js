import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import { createApi, handleError } from './api.js';
import { createWhatsApp, whatsappConfig } from './whatsapp.js';
import { smtpVerification } from './email-verification.js';

const host = process.env.SOTOVOR_HOST || '127.0.0.1';
const port = Number(process.env.SOTOVOR_PORT || 3000);
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const verificationMail = smtpVerification();
const database = await connect();
const app = express();
app.disable('x-powered-by');
if (process.env.SOTOVOR_TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:");
  next();
});
const whatsapp = whatsappConfig();
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
app.get('/api/health', (_req, res) => res.json({ service: 'sotovor', desktopAuth: true, desktopCookie: true }));
if (whatsapp) app.use('/webhooks/whatsapp', createWhatsApp(database, whatsapp));
if (process.env.SOTOVOR_REQUIRE_SMTP === '1') {
  app.post('/api/auth/register', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Preveč poskusov registracije. Poskusi pozneje.' },
  }));
}
app.post('/api/entries', express.json({ limit: '3mb' }));
app.use('/api', express.json({ limit: '8kb' }), createApi(database, { whatsappEnabled: Boolean(whatsapp), verificationMail }));
app.use(express.static(dist));
app.use(handleError);

const server = app.listen(port, host);
server.once('listening', () => {
  const address = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${address.includes(':') ? `[${address}]` : address}:${server.address().port}`;
  console.log(`Sotovor teče na ${url}`);
  process.send?.({ ready: true, port: server.address().port });
  console.log('Za ustavitev pritisni Ctrl+C.');
});
server.once('error', async error => {
  console.error(error.code === 'EADDRINUSE' ? `Vrata ${port} so že v uporabi.` : error.message);
  await database.client.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => void database.client.close()));
}
