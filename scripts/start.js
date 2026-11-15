import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';

const port = Number(process.env.SOTOVOR_MONGO_PORT || 27027);
const uri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
const data = resolve('data/mongodb');
let mongo;
let api;
let stopping = false;

function mongoExecutable() {
  if (process.env.SOTOVOR_MONGOD) return process.env.SOTOVOR_MONGOD;
  const base = join(process.env.ProgramFiles || 'C:/Program Files', 'MongoDB', 'Server');
  const versions = existsSync(base) ? readdirSync(base).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })) : [];
  return versions.map(version => join(base, version, 'bin', 'mongod.exe')).find(existsSync) || 'mongod';
}

function isPortFree() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function openBrowser(port) {
  if (stopping || process.platform !== 'win32' || process.env.SOTOVOR_NO_BROWSER === '1') return;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  const url = `http://127.0.0.1:${port}/`;
  const browser = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${url}' -ErrorAction Stop`,
  ], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  const fallback = () => console.error(`Brskalnika ni bilo mogoče odpreti. Odpri ${url} ročno.`);
  browser.once('error', fallback);
  browser.once('exit', code => { if (code !== 0) fallback(); });
}

async function runningApp(port) {
  try {
    const result = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return result.ok && (await result.json()).service === 'sotovor';
  } catch {
    return false;
  }
}

async function checkExistingMongo() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
  try {
    const result = await client.db('admin').command({ getCmdLineOpts: 1 });
    const path = result.parsed?.storage?.dbPath;
    if (path && resolve(path).toLowerCase() === data.toLowerCase()) return;
  } catch {
    // A different service may be listening on this port.
  } finally {
    await client.close();
  }
  throw new Error(`Vrata ${port} uporablja druga storitev. Nastavi SOTOVOR_MONGO_PORT na prosta vrata ali ustavi Compose.`);
}

async function stop() {
  if (stopping) return;
  stopping = true;
  api?.kill();
  if (!mongo || mongo.exitCode !== null || !mongo.pid) return;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1200, socketTimeoutMS: 2500 });
  try {
    await client.db('admin').command({ shutdown: 1, force: true });
  } catch {
    // MongoDB closes the connection as part of a successful shutdown.
  } finally {
    await client.close();
    await delay(500);
    if (mongo.exitCode === null) mongo.kill();
  }
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Neveljavna vrata MongoDB.');
  const httpPort = Number(process.env.SOTOVOR_PORT || 3000);
  if (httpPort && await runningApp(httpPort)) {
    console.log(`Sotovor že teče na http://127.0.0.1:${httpPort}/`);
    openBrowser(httpPort);
    if (process.platform === 'win32' && process.env.SOTOVOR_NO_BROWSER !== '1') process.exitCode = 10;
  } else {
    if (await isPortFree()) {
      mkdirSync(data, { recursive: true });
      mongo = spawn(mongoExecutable(), [
        '--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', data,
        '--logpath', resolve('data/mongodb.log'), '--logappend',
      ], { stdio: 'ignore' });
      let mongoError;
      mongo.once('error', error => { mongoError = error; });
      const deadline = Date.now() + 25000;
      let connectionError;
      while (!stopping) {
        if (mongoError?.code === 'ENOENT') throw new Error('Namesti MongoDB Community Server ali nastavi SOTOVOR_MONGOD.');
        if (mongoError || mongo.exitCode !== null || Date.now() > deadline) {
          throw new Error('MongoDB se ni zagnal. Preveri data/mongodb.log.', { cause: connectionError });
        }
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
        try {
          await client.db('admin').command({ ping: 1 });
          break;
        } catch (error) {
          connectionError = error;
          await delay(250);
        } finally {
          await client.close();
        }
      }
    } else {
      await checkExistingMongo();
    }
    if (!stopping) {
      api = spawn(process.execPath, ['backend/src/server.js'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env, SOTOVOR_MONGO_URI: uri },
      });
      api.once('message', ({ ready, port }) => {
        if (ready) openBrowser(port);
      });
      api.once('exit', code => {
        if (!stopping) process.exitCode = code ?? 1;
        void stop();
      });
      api.once('error', error => {
        console.error(error.message);
        process.exitCode = 1;
        void stop();
      });
      mongo?.once('exit', () => {
        if (stopping) return;
        console.error('MongoDB se je ustavil. Preveri data/mongodb.log.');
        process.exitCode = 1;
        void stop();
      });
    }
  }
} catch (error) {
  console.error(error.message);
  if (error.cause) console.error(error.cause.message);
  process.exitCode = 1;
  await stop();
}
