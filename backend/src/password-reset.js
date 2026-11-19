import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { emailPattern, passwordHash } from './accounts.js';
import { HttpError } from './api-errors.js';
import { hash } from './mobile-auth.js';

export function registerPasswordReset(
  router,
  { accounts, sessions, mobileSessions, devices },
  send,
  reportFailure,
) {
  const limit = () =>
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 8,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Preveč poskusov. Poskusi pozneje.' },
    });
  router.post('/auth/password/request', limit(), (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length <= 254 && emailPattern.test(email)) void mailLink(email).catch(reportFailure);
    res.json({ ok: true });
  });

  async function mailLink(email) {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const account = await accounts.findOneAndUpdate(
      {
        email,
        $or: [
          { passwordReset: { $exists: false } },
          { 'passwordReset.sentAt': { $lte: new Date(now - 60_000) } },
        ],
      },
      {
        $set: {
          passwordReset: { hash: hash(token), sentAt: new Date(now), expiresAt: new Date(now + 3_600_000) },
        },
      },
      { projection: { _id: 1 } },
    );
    if (account) await send(email, token, 'password');
  }

  router.post('/auth/password/reset', limit(), async (req, res) => {
    const { token, password } = req.body;
    const invalidLink = () => new HttpError(400, 'Povezava za ponastavitev je neveljavna ali je potekla.');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalidLink();
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      throw new HttpError(400, 'Geslo naj vsebuje od 10 do 128 znakov.');
    }
    const condition = { 'passwordReset.hash': hash(token), 'passwordReset.expiresAt': { $gt: new Date() } };
    if (!(await accounts.findOne(condition, { projection: { _id: 1 } }))) throw invalidLink();
    const replacement = await passwordHash(password);
    const account = await accounts.findOneAndUpdate(
      { ...condition, 'passwordReset.expiresAt': { $gt: new Date() } },
      {
        $set: { passwordHash: replacement },
        $unset: { passwordReset: '', calendarTokenHash: '' },
      },
      { projection: { _id: 1 } },
    );
    if (!account) throw invalidLink();
    const filter = { accountId: account._id };
    const stale = { ...filter, credential: { $ne: hash(replacement) } };
    const staleSessions = await mobileSessions.find(stale, { projection: { _id: 1 } }).toArray();
    await Promise.all([
      sessions.deleteMany(filter),
      mobileSessions.deleteMany(stale),
      devices.deleteMany({ ...filter, sessionId: { $in: staleSessions.map((item) => item._id) } }),
    ]);
    res.json({ ok: true });
  });
}
