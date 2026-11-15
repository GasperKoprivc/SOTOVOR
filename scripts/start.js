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

function checkPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Vrata MongoDB ${port} so že v uporabi.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
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
  await checkPort();
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
  if (!stopping) {
    api = spawn(process.execPath, ['backend/src/server.js'], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, SOTOVOR_MONGO_URI: uri },
    });
    api.once('message', ({ ready, port }) => {
      if (!ready || stopping || process.platform !== 'win32' || process.env.SOTOVOR_NO_BROWSER === '1') return;
      if (!Number.isInteger(port) || port < 1 || port > 65535) return;
      const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://127.0.0.1:${port}/`], {
        stdio: 'ignore', windowsHide: true,
      });
      browser.once('error', error => console.error(`Odpri naslov v brskalniku ročno. ${error.message}`));
      browser.unref();
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
    mongo.once('exit', () => {
      if (stopping) return;
      console.error('MongoDB se je ustavil. Preveri data/mongodb.log.');
      process.exitCode = 1;
      void stop();
    });
  }
} catch (error) {
  console.error(error.message);
  if (error.cause) console.error(error.cause.message);
  process.exitCode = 1;
  await stop();
}
