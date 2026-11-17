import { createHash, randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { passwordHash, verifyPassword } from './accounts.js';

export const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const refreshSeconds = 30 * 24 * 60 * 60;
const invalidSession = () => new HttpError(401, 'Seja je potekla ali je bila preklicana.', 'invalid_session');
export const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

export async function bearerSession(header, { mobileSessions, accounts }) {
  const value = header.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!value) throw invalidSession();
  const now = new Date();
  const session = await mobileSessions.findOne({
    accessHash: hash(value), accessExpiresAt: { $gt: now }, expiresAt: { $gt: now },
  });
  if (!session) throw invalidSession();
  const account = await accounts.findOne({ _id: session.accountId });
  if (!account || hash(account.passwordHash) !== session.credential) throw invalidSession();
  return { session, account };
}

export function registerMobileAuth(router, { accounts, mobileSessions, devices }, {
  accessSeconds = 600, verificationEnabled = false, minSupported = '0.1.0', latest = minSupported,
} = {}) {
  if (!Number.isInteger(accessSeconds) || accessSeconds < 1 || accessSeconds > 900) {
    throw new Error('SOTOVOR_MOBILE_ACCESS_SECONDS must be between 1 and 900.');
  }
  if (![minSupported, latest].every(version => /^\d+\.\d+\.\d+$/.test(version))) {
    throw new Error('Android versions must use major.minor.patch.');
  }
  const limiter = (limit, windowMs) => rateLimit({
    limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Preveč poskusov. Poskusi pozneje.' },
  });
  const dummy = passwordHash(token());
  const fresh = () => {
    const accessToken = token();
    const refreshToken = token();
    return {
      response: { accessToken, refreshToken, expiresIn: accessSeconds },
      record: {
        accessHash: hash(accessToken), refreshHash: hash(refreshToken),
        accessExpiresAt: new Date(Date.now() + accessSeconds * 1000), lastUsedAt: new Date(),
      },
    };
  };
  const response = (tokens, id, account) => ({
    ...tokens, sessionId: String(id),
    emailVerificationPending: verificationEnabled && !account.emailVerifiedAt,
  });
  const currentAccount = req => {
    if (!req.account) throw invalidSession();
    return req.account._id;
  };

  router.get('/mobile/min-version', (_req, res) => res.json({ minSupported, latest }));
  router.post('/mobile/auth/login', limiter(8, 15 * 60_000), async (req, res) => {
    const { email, password, deviceName } = req.body;
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128 ||
        typeof deviceName !== 'string' || !deviceName.trim() || deviceName.length > 80) {
      throw new HttpError(400, 'Vnesi e-pošto, geslo in ime naprave.');
    }
    const account = await accounts.findOne({ email: email.trim().toLowerCase() });
    const correct = await verifyPassword(password, account?.passwordHash ?? await dummy);
    if (!account || !correct) throw new HttpError(401, 'E-pošta ali geslo ni pravilno.', 'invalid_credentials');
    const session = fresh();
    const result = await mobileSessions.insertOne({
      ...session.record, accountId: account._id, deviceName: deviceName.trim(), credential: hash(account.passwordHash),
      createdAt: new Date(), expiresAt: new Date(Date.now() + refreshSeconds * 1000),
    });
    res.json(response(session.response, result.insertedId, account));
  });
  router.post('/mobile/auth/refresh', limiter(20, 60_000), async (req, res) => {
    if (!validToken(req.body.refreshToken)) throw invalidSession();
    const condition = { refreshHash: hash(req.body.refreshToken), expiresAt: { $gt: new Date() } };
    const prior = await mobileSessions.findOne(condition);
    if (!prior) throw invalidSession();
    const account = await accounts.findOne({ _id: prior.accountId });
    if (!account || hash(account.passwordHash) !== prior.credential) throw invalidSession();
    const session = fresh();
    session.record.accessExpiresAt = new Date(Math.min(+prior.expiresAt, +session.record.accessExpiresAt));
    const updated = await mobileSessions.updateOne({ ...condition, _id: prior._id }, { $set: session.record });
    if (!updated.modifiedCount) throw invalidSession();
    res.json(response(session.response, prior._id, account));
  });
  router.post('/mobile/auth/logout', limiter(20, 60_000), async (req, res) => {
    if (!req.mobileSession) throw invalidSession();
    await mobileSessions.deleteOne({ _id: req.mobileSession._id });
    await devices.deleteMany({ sessionId: req.mobileSession._id });
    res.json({ ok: true });
  });
  router.get('/mobile/auth/sessions', async (req, res) => {
    const accountId = currentAccount(req);
    const items = await mobileSessions.find({
      accountId, credential: hash(req.account.passwordHash), expiresAt: { $gt: new Date() },
    }).sort({ lastUsedAt: -1 }).limit(100).toArray();
    res.json(items.map(item => ({
      id: String(item._id), deviceName: item.deviceName, current: item._id.equals(req.mobileSession?._id),
      createdAt: item.createdAt, lastUsedAt: item.lastUsedAt, expiresAt: item.expiresAt,
    })));
  });
  router.delete('/mobile/auth/sessions/:id', async (req, res) => {
    const accountId = currentAccount(req);
    if (!validId(req.params.id)) throw new HttpError(404, 'Seja ne obstaja.');
    const id = new ObjectId(req.params.id);
    const result = await mobileSessions.deleteOne({ _id: id, accountId });
    if (!result.deletedCount) throw new HttpError(404, 'Seja ne obstaja.');
    await devices.deleteMany({ sessionId: id, accountId });
    res.json({ ok: true });
  });
}
