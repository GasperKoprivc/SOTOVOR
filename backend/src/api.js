import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Binary, ObjectId } from 'mongodb';
import { materializeOccurrences, nextOccurrence } from './recurrence.js';
import { codeHash } from './whatsapp.js';
import { emailPattern, passwordHash, publicProfile, sessionSeconds, verifyPassword } from './accounts.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^[0-9a-f]{24}$/;
const categories = new Set(['dom', 'druzina', 'opravki', 'zdravje', 'drugo']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requiredText(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw new HttpError(400, `${label} mora imeti od 1 do ${limit} znakov.`);
  }
  return value.trim();
}

function parseVoice(voice) {
  if (voice == null) return null;
  const signatures = new Map([
    ['audio/webm', [0, '1a45dfa3']], ['audio/ogg', [0, '4f676753']], ['audio/mp4', [4, '66747970']],
  ]);
  const { mime, data } = voice;
  const format = signatures.get(mime);
  const limit = 2 * 1024 * 1024;
  if (!format || typeof data !== 'string' || data.length > 4 * Math.ceil(limit / 3) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, 'Posnetek ni podprt ali presega 2 MB.');
  const bytes = Buffer.from(data, 'base64');
  const [offset, signature] = format;
  if (bytes.length > limit || bytes.subarray(offset, offset + 4).toString('hex') !== signature) {
    throw new HttpError(400, 'Posnetek ni veljaven.');
  }
  return { mime, bytes: new Binary(bytes) };
}

export function createApi({ households, entries, accounts, sessions }, { whatsappEnabled = false } = {}) {
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/' };

  async function startSession(req, res, account) {
    const token = randomBytes(32).toString('hex');
    await sessions.insertOne({
      _id: hash(token), accountId: account._id, expiresAt: new Date(Date.now() + sessionSeconds * 1000),
    });
    if (req.sessionId) await sessions.deleteOne({ _id: req.sessionId });
    res.cookie('sotovor_session', token, { ...cookieOptions, secure: req.secure, maxAge: sessionSeconds * 1000 });
  }

  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && (!req.is('application/json') || !req.body || Array.isArray(req.body))) {
      throw new HttpError(415, 'Pošlji podatke v obliki objekta JSON.');
    }
    const token = req.headers.cookie?.match(/(?:^|;\s*)sotovor_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token) {
      const sessionHash = hash(token);
      const session = await sessions.findOne({ _id: sessionHash, expiresAt: { $gt: new Date() } });
      if (session) {
        req.sessionId = sessionHash;
        req.account = await accounts.findOne({ _id: session.accountId });
        const household = await households.findOne({ 'members.accountId': session.accountId });
        if (household && req.account) {
          req.household = household;
          req.member = household.members.find(member => member.accountId?.equals(session.accountId));
        }
      }
      const legacy = !session && await households.findOne({
        members: { $elemMatch: { sessionHash, expiresAt: { $gt: new Date() } } },
      });
      if (legacy) {
        req.household = legacy;
        req.member = legacy.members.find(member => member.sessionHash === sessionHash);
      }
    }
    next();
  });

  async function dashboard(household, member, account) {
    const profile = account ? publicProfile(account) : null;
    if (!household) return profile ? { profile, household: null } : null;
    const admin = (household.ownerId ?? household.members[0]?.id) === member.id;
    await materializeOccurrences(entries, household._id);
    const items = await entries.find({ householdId: household._id, archivedAt: null }, {
      projection: { householdId: 0, nextOccurrence: 0, whatsappMessageId: 0, 'voice.bytes': 0 },
    }).sort({ createdAt: -1 }).toArray();
    return {
      memberId: member.id,
      profile,
      admin,
      whatsapp: { enabled: whatsappEnabled, linked: Boolean(household.whatsappSender) },
      household: { name: household.name, expectedMembers: household.expectedMembers ?? null,
        ...(admin ? { inviteCode: household.inviteCode } : {}) },
      members: household.members.map(({ id, name, inactive }) => ({ id, name, inactive: Boolean(inactive) })),
      entries: items.map(({ _id, ...item }) => ({ id: String(_id), ...item })),
    };
  }

  const currentDashboard = req => dashboard(req.household, req.member, req.account);
  router.get('/dashboard', async (req, res) => res.json(await currentDashboard(req)));

  router.post('/auth/register', async (req, res) => {
    if (req.account) throw new HttpError(409, 'Že si prijavljen.');
    const firstName = requiredText(req.body.firstName, 40, 'Ime');
    const lastName = requiredText(req.body.lastName, 50, 'Priimek');
    const email = requiredText(req.body.email, 254, 'E-pošta').toLowerCase();
    const phone = requiredText(req.body.phone, 25, 'Telefon');
    const { password } = req.body;
    if (!emailPattern.test(email)) throw new HttpError(400, 'Vnesi veljaven e-poštni naslov.');
    if (!/^\+?[\d ().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))) {
      throw new HttpError(400, 'Vnesi veljavno telefonsko številko.');
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      throw new HttpError(400, 'Geslo naj vsebuje od 10 do 128 znakov.');
    }
    const account = { _id: new ObjectId(), firstName, lastName, email, phone, passwordHash: await passwordHash(password) };
    try {
      await accounts.insertOne(account);
    } catch (error) {
      if (error.code === 11000) throw new HttpError(409, 'Račun s tem e-poštnim naslovom že obstaja.');
      throw error;
    }
    if (req.member) {
      const linked = await households.updateOne({
        _id: req.household._id, members: { $elemMatch: { id: req.member.id, sessionHash: req.member.sessionHash } },
      }, {
        $set: { 'members.$.accountId': account._id, 'members.$.name': `${firstName} ${lastName}` },
        $unset: { 'members.$.sessionHash': '', 'members.$.expiresAt': '' },
      });
      if (!linked.matchedCount) {
        await accounts.deleteOne({ _id: account._id });
        throw new HttpError(409, 'Članstvo se je medtem spremenilo. Osveži stran.');
      }
    }
    await startSession(req, res, account);
    res.status(201).json({ ok: true });
  });

  const dummyPassword = passwordHash(randomBytes(24).toString('hex'));
  router.post('/auth/login', async (req, res) => {
    const email = requiredText(req.body.email, 254, 'E-pošta').toLowerCase();
    const { password } = req.body;
    if (typeof password !== 'string' || password.length > 128) throw new HttpError(400, 'Vnesi geslo.');
    const account = await accounts.findOne({ email });
    const matched = await verifyPassword(password, account?.passwordHash ?? await dummyPassword);
    if (!matched || !account) throw new HttpError(401, 'E-pošta ali geslo ni pravilno.');
    await startSession(req, res, account);
    res.json({ ok: true });
  });

  router.post('/auth/logout', async (req, res) => {
    if (req.sessionId) await sessions.deleteOne({ _id: req.sessionId });
    res.clearCookie('sotovor_session', { ...cookieOptions, secure: req.secure });
    res.json({ ok: true });
  });

  for (const joining of [false, true]) {
    router.post(joining ? '/households/join' : '/households', async (req, res) => {
      if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
      if (req.member) throw new HttpError(409, 'Tvoj račun že pripada družinskemu prostoru.');
      const member = {
        id: new ObjectId().toHexString(), name: `${req.account.firstName} ${req.account.lastName}`,
        accountId: req.account._id,
      };
      try {
      if (joining) {
        const inviteCode = requiredText(req.body.inviteCode, 32, 'Koda povabila').toLowerCase();
        const result = await households.updateOne({ inviteCode, 'members.accountId': { $ne: req.account._id } },
          { $push: { members: member } });
        if (!result.matchedCount) {
          if (await households.findOne({ 'members.accountId': req.account._id })) throw new HttpError(409, 'Tvoj račun že pripada prostoru.');
          throw new HttpError(404, 'Koda povabila ni veljavna.');
        }
      } else {
        const { expectedMembers } = req.body;
        if (!Number.isInteger(expectedMembers) || expectedMembers < 1 || expectedMembers > 100) {
          throw new HttpError(400, 'Vnesi število družinskih članov od 1 do 100.');
        }
        await households.insertOne({
          name: requiredText(req.body.householdName, 80, 'Ime prostora'),
          inviteCode: randomBytes(16).toString('hex'), members: [member], ownerId: member.id, expectedMembers,
        });
      }
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'Tvoj račun že pripada družinskemu prostoru.');
        throw error;
      }
      res.status(201).json({ ok: true });
    });
  }

  router.use((req, res, next) => {
    if (!req.member) throw new HttpError(401, 'Najprej se pridruži družinskemu prostoru.');
    next();
  });

  router.post('/whatsapp/pair', async (req, res) => {
    if (!whatsappEnabled) throw new HttpError(404, 'WhatsApp še ni nastavljen.');
    const code = randomBytes(12).toString('hex');
    await households.updateOne({ _id: req.household._id }, { $set: {
      whatsappPairing: { hash: codeHash(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    } });
    res.json({ code });
  });

  router.post('/whatsapp/unlink', async (req, res) => {
    if (!whatsappEnabled) throw new HttpError(404, 'WhatsApp še ni nastavljen.');
    await households.updateOne({ _id: req.household._id }, { $unset: { whatsappSender: '', whatsappPairing: '' } });
    res.json({ ok: true });
  });

  function entryFields(req) {
    const { kind, dueOn = null, category = 'drugo', repeatDays = 0, rotate = false, reminderDays = 2 } = req.body;
    if (kind !== 'task' && kind !== 'event') throw new HttpError(400, 'Izberi opravilo ali dogodek.');
    const title = requiredText(req.body.title, 160, 'Naslov');
    if (!categories.has(category)) throw new HttpError(400, 'Izberi veljavno kategorijo.');
    if (dueOn !== null) {
      const date = typeof dueOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? new Date(dueOn) : null;
      if (!date || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== dueOn) {
        throw new HttpError(400, 'Izberi veljaven datum.');
      }
    }
    if (kind === 'event' && !dueOn) throw new HttpError(400, 'Dogodek potrebuje datum.');
    if (!Number.isInteger(repeatDays) || repeatDays < 0 || repeatDays > 3660 ||
        (repeatDays > 0 && (kind !== 'task' || !dueOn)) || typeof rotate !== 'boolean' ||
        (rotate && !repeatDays)) {
      throw new HttpError(400, 'Za ponavljanje opravila izberi rok in veljaven interval.');
    }
    if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) {
      throw new HttpError(400, 'Opomnik nastavi od 0 do 30 dni pred rokom.');
    }
    const assigneeId = kind === 'task' ? req.body.assigneeId ?? null : null;
    if (assigneeId !== null && !req.household.members.some(member => member.id === assigneeId)) {
      throw new HttpError(400, 'Izberi člana tega prostora.');
    }
    return { kind, title, dueOn, category, assigneeId, repeatDays, rotate, reminderDays };
  }

  router.post('/entries', async (req, res) => {
    const fields = entryFields(req);
    const voice = parseVoice(req.body.voice);
    await entries.insertOne({
      ...fields, householdId: req.household._id,
      assignedAt: fields.assigneeId ? new Date() : null,
      completedAt: null, createdAt: new Date(),
      ...(voice ? { voice } : {}),
    });
    res.status(201).json(await currentDashboard(req));
  });

  router.post('/entries/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    if (!idPattern.test(id) || !['edit', 'remove'].includes(action)) throw new HttpError(404, 'Ta pot ne obstaja.');
    const condition = { _id: new ObjectId(id), householdId: req.household._id, archivedAt: null };
    const entry = await entries.findOne(condition, { projection: { voice: 0 } });
    if (!entry) throw new HttpError(404, 'Vnos ne obstaja.');
    if (entry.completedAt) throw new HttpError(409, 'Zaključeno opravilo ostane v zgodovini.');
    if (req.body.version !== (entry.version ?? 0)) {
      throw new HttpError(409, 'Vnos se je spremenil. Zapri obrazec in ga znova odpri.');
    }
    const fields = action === 'remove' ? { archivedAt: new Date() } : entryFields(req);
    if (action === 'edit' && fields.kind !== entry.kind) throw new HttpError(400, 'Vrste vnosa ni mogoče spremeniti.');
    if (action === 'edit' && fields.assigneeId !== entry.assigneeId) {
      fields.assignedAt = fields.assigneeId ? new Date() : null;
      fields.coverRequestedAt = null;
    }
    const result = await entries.updateOne({
      ...condition, completedAt: null, assigneeId: entry.assigneeId, version: entry.version ?? null,
    }, { $set: fields, $inc: { version: 1 } });
    if (!result.matchedCount) throw new HttpError(409, 'Vnos se je spremenil. Zapri obrazec in ga znova odpri.');
    res.json(await currentDashboard(req));
  });

  router.get('/entries/:id/voice', async (req, res) => {
    const { id } = req.params;
    if (!idPattern.test(id)) throw new HttpError(404, 'Posnetek ne obstaja.');
    const entry = await entries.findOne({ _id: new ObjectId(id), householdId: req.household._id, archivedAt: null }, {
      projection: { voice: 1 },
    });
    if (!entry?.voice) throw new HttpError(404, 'Posnetek ne obstaja.');
    res.type(entry.voice.mime).send(Buffer.from(entry.voice.bytes.value()));
  });

  router.post('/tasks/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    const changes = {
      claim: { assigneeId: req.member.id, assignedAt: new Date(), coverRequestedAt: null },
      cover: { assigneeId: null, assignedAt: null, coverRequestedAt: new Date() },
      complete: { completedAt: new Date() },
    };
    if (!idPattern.test(id) || !Object.hasOwn(changes, action)) throw new HttpError(404, 'Ta pot ne obstaja.');
    const task = { _id: new ObjectId(id), householdId: req.household._id, kind: 'task', archivedAt: null };
    const condition = {
      ...task, completedAt: null, assigneeId: action === 'claim' ? null : req.member.id,
    };
    if (action === 'complete') {
      const current = await entries.findOne(condition, { projection: { voice: 0 } });
      if (!current) throw new HttpError(409, 'Stanje opravila se je spremenilo ali pa dejanje ni na voljo.');
      condition.version = current.version ?? null;
      const next = current && nextOccurrence(current, req.household.members);
      if (next) changes.complete.nextOccurrence = next;
    }
    const result = await entries.updateOne(condition, { $set: changes[action], $inc: { version: 1 } });
    if (!result.matchedCount) {
      if (!await entries.findOne(task)) throw new HttpError(404, 'Opravilo ne obstaja.');
      throw new HttpError(409, 'Stanje opravila se je spremenilo ali pa dejanje ni na voljo.');
    }
    res.json(await currentDashboard(req));
  });

  router.use((_req, res) => res.status(404).json({ error: 'Ta pot ne obstaja.' }));
  return router;
}

export function handleError(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Neveljavni podatki JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Zahteva je prevelika.' });
  console.error(error);
  return res.status(500).json({ error: 'Prišlo je do napake na strežniku.' });
}
