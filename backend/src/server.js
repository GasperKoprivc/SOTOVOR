import express from 'express';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import { createApi, handleError } from './api.js';

const host = process.env.SOTOVOR_HOST || '127.0.0.1';
const port = Number(process.env.SOTOVOR_PORT || 3000);
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const database = await connect();
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'");
  next();
});
app.use('/api', express.json({ limit: '8kb' }), createApi(database));
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
