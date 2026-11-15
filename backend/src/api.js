import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { ObjectId } from 'mongodb';

const sessionSeconds = 90 * 24 * 60 * 60;
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

export function createApi({ households, entries }) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && (!req.is('application/json') || !req.body || Array.isArray(req.body))) {
      throw new HttpError(415, 'Pošlji podatke v obliki objekta JSON.');
    }
    const token = req.headers.cookie?.match(/(?:^|;\s*)sotovor_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token) {
      const sessionHash = hash(token);
      const household = await households.findOne({
        members: { $elemMatch: { sessionHash, expiresAt: { $gt: new Date() } } },
      });
      if (household) {
        req.household = household;
        req.member = household.members.find(member => member.sessionHash === sessionHash);
      }
    }
    next();
  });

  async function dashboard(household, member) {
    if (!household) return null;
    const items = await entries.find({ householdId: household._id }, {
      projection: { householdId: 0 },
    }).sort({ createdAt: -1 }).toArray();
    return {
      memberId: member.id,
      household: { name: household.name, inviteCode: household.inviteCode },
      members: household.members.map(({ id, name }) => ({ id, name })),
      entries: items.map(({ _id, ...item }) => ({ id: String(_id), ...item })),
    };
  }

  router.get('/dashboard', async (req, res) => res.json(await dashboard(req.household, req.member)));

  for (const joining of [false, true]) {
    router.post(joining ? '/households/join' : '/households', async (req, res) => {
      if (req.member) throw new HttpError(409, 'V tem brskalniku že uporabljaš družinski prostor.');
      const name = requiredText(req.body.memberName, 60, 'Ime člana');
      const token = randomBytes(32).toString('hex');
      const member = {
        id: new ObjectId().toHexString(), name, sessionHash: hash(token),
        expiresAt: new Date(Date.now() + sessionSeconds * 1000),
      };
      if (joining) {
        const inviteCode = requiredText(req.body.inviteCode, 32, 'Koda povabila').toLowerCase();
        const result = await households.updateOne({ inviteCode }, { $push: { members: member } });
        if (!result.matchedCount) throw new HttpError(404, 'Koda povabila ni veljavna.');
      } else {
        await households.insertOne({
          name: requiredText(req.body.householdName, 80, 'Ime prostora'),
          inviteCode: randomBytes(16).toString('hex'), members: [member],
        });
      }
      res.cookie('sotovor_session', token, { httpOnly: true, sameSite: 'strict', maxAge: sessionSeconds * 1000 });
      res.status(201).json({ ok: true });
    });
  }

  router.use((req, res, next) => {
    if (!req.member) throw new HttpError(401, 'Najprej se pridruži družinskemu prostoru.');
    next();
  });

  router.post('/entries', async (req, res) => {
    const { kind, dueOn = null, category = 'drugo' } = req.body;
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
    const assigneeId = kind === 'task' ? req.body.assigneeId ?? null : null;
    if (assigneeId !== null && !req.household.members.some(member => member.id === assigneeId)) {
      throw new HttpError(400, 'Izberi člana tega prostora.');
    }
    await entries.insertOne({
      householdId: req.household._id, kind, title, dueOn, category, assigneeId,
      completedAt: null, createdAt: new Date(),
    });
    res.status(201).json(await dashboard(req.household, req.member));
  });

  router.post('/tasks/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    const changes = {
      claim: { assigneeId: req.member.id },
      cover: { assigneeId: null },
      complete: { completedAt: new Date() },
    };
    if (!idPattern.test(id) || !Object.hasOwn(changes, action)) throw new HttpError(404, 'Ta pot ne obstaja.');
    const task = { _id: new ObjectId(id), householdId: req.household._id, kind: 'task' };
    const result = await entries.updateOne({
      ...task, completedAt: null, assigneeId: action === 'claim' ? null : req.member.id,
    }, { $set: changes[action] });
    if (!result.matchedCount) {
      if (!await entries.findOne(task)) throw new HttpError(404, 'Opravilo ne obstaja.');
      throw new HttpError(409, 'Stanje opravila se je spremenilo ali pa dejanje ni na voljo.');
    }
    res.json(await dashboard(req.household, req.member));
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
