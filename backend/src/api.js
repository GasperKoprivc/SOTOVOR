import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Binary, ObjectId } from 'mongodb';
import { materializeOccurrences, nextOccurrence } from './recurrence.js';
import { codeHash } from './whatsapp.js';
import { emailPattern, passwordHash, publicProfile, sessionSeconds, verifyPassword } from './accounts.js';
import { registerDesktopAuth } from './desktop-auth.js';
import { confirmEmailVerification, sendEmailVerification } from './email-verification.js';
import { availabilityStates, familyRoles, householdDay, isDay, planTasks } from './planning.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^[0-9a-f]{24}$/;
const categories = new Set(['dom', 'druzina', 'opravki', 'zdravje', 'drugo']);
const defaultPermissions = { create: true, edit: false, move: false, remove: false };
const adminPermissions = { create: true, edit: true, move: true, remove: true };
const isAdmin = (household, member) => (household.ownerId ?? household.members[0]?.id) === member.id;
const access = (household, member) => isAdmin(household, member) ? adminPermissions :
  { ...defaultPermissions, ...member.permissions };

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

export function createApi({ households, entries, accounts, sessions, desktopLinks }, {
  whatsappEnabled = false, verificationMail, reportMailFailure = () => console.error('Verification email delivery failed.'),
} = {}) {
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/' };

  async function startSession(req, res, accountId) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + sessionSeconds * 1000);
    await sessions.insertOne({ _id: hash(token), accountId, expiresAt });
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
        const membership = { $or: [
          { 'members.accountId': session.accountId },
          { 'members.guestAccountId': session.accountId },
          { ownerAccountId: session.accountId },
        ] };
        const getMember = household => household.members.find(member =>
          member.accountId?.equals(session.accountId) ||
          member.guestAccountId?.equals(session.accountId) ||
          (household.ownerAccountId?.equals(session.accountId) && member.id === household.ownerId));
        if (req.account) {
          const spaces = await households.find(membership).sort({ _id: 1 }).toArray();
          const scope = req.get('x-sotovor-household') || (req.method === 'GET' ? req.query.household : undefined);
          req.spaces = spaces.map(household => ({
            id: String(household._id), name: household.name, admin: isAdmin(household, getMember(household)),
          }));
          const preferred = spaces.find(household => household.members.some(member => member.accountId?.equals(session.accountId))) ?? spaces[0];
          const selected = scope ? spaces.find(household => String(household._id) === scope) : preferred;
          if (scope && !selected) throw new HttpError(403, 'Ta družinski prostor ni dostopen tvojemu računu.');
          req.household = selected;
          req.member = selected && getMember(selected);
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

  registerDesktopAuth(router, {
    desktopLinks, hash,
    setDesktopSession: startSession,
  });

  async function dashboard(household, member, account, spaces = []) {
    const profile = account ? publicProfile(account) : null;
    if (profile && verificationMail) profile.emailVerificationPending = !account.emailVerifiedAt;
    if (!household) return profile ? { profile, household: null, spaces } : null;
    const admin = isAdmin(household, member);
    const inactiveMemberIds = new Set(household.members.filter(person => person.inactive).map(person => person.id));
    await materializeOccurrences(entries, household._id);
    const items = await entries.find({ householdId: household._id, archivedAt: null }, {
      projection: { householdId: 0, nextOccurrence: 0, whatsappMessageId: 0, 'voice.bytes': 0 },
    }).sort({ createdAt: -1 }).toArray();
    return {
      memberId: member.id,
      profile,
      spaces,
      admin,
      permissions: access(household, member),
      leaveRequested: Boolean(member.leaveRequestedAt),
      whatsapp: { enabled: whatsappEnabled, linked: Boolean(household.whatsappSender) },
      household: { id: String(household._id), name: household.name, expectedMembers: household.expectedMembers ?? null,
        ...(admin ? { inviteCode: household.inviteCode } : {}) },
      members: household.members.map(person => ({
        id: person.id, name: person.name, inactive: Boolean(person.inactive), admin: isAdmin(household, person),
        familyRole: person.familyRole ?? 'other',
        ...(admin ? { permissions: access(household, person), leaveRequested: Boolean(person.leaveRequestedAt),
          availability: person.availability ?? 'available', unavailableUntil: person.unavailableUntil ?? null } : {}),
      })),
      entries: items.map(({ _id, ...item }) => ({
        id: String(_id), ...item,
        assigneeId: !item.completedAt && inactiveMemberIds.has(item.assigneeId)
          ? null : item.assigneeId,
      })),
    };
  }

  const currentDashboard = req => dashboard(req.household, req.member, req.account, req.spaces);
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
    await startSession(req, res, account._id);
    if (verificationMail) await sendEmailVerification(accounts, account, verificationMail, reportMailFailure);
    res.status(201).json({ ok: true });
  });

  if (verificationMail) {
    router.post('/auth/email/resend', async (req, res) => {
      if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
      if (req.account.emailVerifiedAt) return res.json({ ok: true });
      const outcome = await sendEmailVerification(accounts, req.account, verificationMail, reportMailFailure);
      if (outcome === 'wait') throw new HttpError(429, 'Pred ponovnim pošiljanjem počakaj eno minuto.');
      if (outcome === 'failed') throw new HttpError(503, 'E-pošte ni bilo mogoče poslati. Poskusi pozneje.');
      res.json({ ok: true });
    });
    router.post('/auth/email/verify', async (req, res) => {
      if (!await confirmEmailVerification(accounts, req.body.token)) {
        throw new HttpError(400, 'Povezava za potrditev je neveljavna ali je potekla.');
      }
      res.json({ ok: true });
    });
  }

  const dummyPassword = passwordHash(randomBytes(24).toString('hex'));
  router.post('/auth/login', async (req, res) => {
    const email = requiredText(req.body.email, 254, 'E-pošta').toLowerCase();
    const { password } = req.body;
    if (typeof password !== 'string' || password.length > 128) throw new HttpError(400, 'Vnesi geslo.');
    const account = await accounts.findOne({ email });
    const matched = await verifyPassword(password, account?.passwordHash ?? await dummyPassword);
    if (!matched || !account) throw new HttpError(401, 'E-pošta ali geslo ni pravilno.');
    await startSession(req, res, account._id);
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
      const hasSpace = req.spaces.length > 0;
      if (req.spaces.some(space => !space.admin)) {
        throw new HttpError(409, 'Tvoj račun je že član druge družine. Pred menjavo naj skrbnik potrdi izstop.');
      }
      const member = {
        id: new ObjectId().toHexString(), name: `${req.account.firstName} ${req.account.lastName}`,
        ...(joining ? { guestAccountId: req.account._id } : !hasSpace ? { accountId: req.account._id } : {}),
      };
      try {
      if (joining) {
        const inviteCode = requiredText(req.body.inviteCode, 32, 'Koda povabila').toLowerCase();
        if (!/^[a-f0-9]{32}$/.test(inviteCode)) throw new HttpError(400, 'Koda povabila mora imeti 32 znakov.');
        const invited = await households.findOneAndUpdate({
          inviteCode, ownerAccountId: { $ne: req.account._id },
          'members.accountId': { $ne: req.account._id }, 'members.guestAccountId': { $ne: req.account._id },
        }, { $push: { members: member } }, { returnDocument: 'after', projection: { _id: 1 } });
        if (!invited) {
          if (await households.findOne({ inviteCode }, { projection: { _id: 1 } })) {
            throw new HttpError(409, 'V tem družinskem prostoru si že.');
          }
          throw new HttpError(404, 'Koda povabila ni veljavna ali je bila zamenjana.');
        }
        return res.status(201).json({ householdId: String(invited._id) });
      } else {
        const { expectedMembers } = req.body;
        if (!Number.isInteger(expectedMembers) || expectedMembers < 1 || expectedMembers > 100) {
          throw new HttpError(400, 'Vnesi število družinskih članov od 1 do 100.');
        }
        const result = await households.insertOne({
          name: requiredText(req.body.householdName, 80, 'Ime prostora'),
          inviteCode: randomBytes(16).toString('hex'), members: [member], ownerId: member.id, expectedMembers,
          ownerAccountId: req.account._id,
        });
        return res.status(201).json({ householdId: String(result.insertedId) });
      }
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'Tvoj račun že pripada družinskemu prostoru.');
        throw error;
      }
    });
  }

  router.use((req, res, next) => {
    if (!req.member) throw new HttpError(401, 'Najprej se pridruži družinskemu prostoru.');
    next();
  });

  function requireAdmin(req) {
    if (!isAdmin(req.household, req.member)) throw new HttpError(403, 'To lahko opravi samo skrbnik prostora.');
  }

  router.post('/households/invite/rotate', async (req, res) => {
    requireAdmin(req);
    await households.updateOne({ _id: req.household._id }, { $set: { inviteCode: randomBytes(16).toString('hex') } });
    res.json({ ok: true });
  });

  router.post('/households/leave', async (req, res) => {
    if (isAdmin(req.household, req.member)) throw new HttpError(403, 'Skrbnik ne more zapustiti svojega prostora.');
    await households.updateOne({ _id: req.household._id, 'members.id': req.member.id },
      { $set: { 'members.$.leaveRequestedAt': new Date() } });
    res.json({ ok: true });
  });

  router.post('/households/members/:id/:action', async (req, res) => {
    requireAdmin(req);
    const { id, action } = req.params;
    const person = req.household.members.find(member => member.id === id && !member.inactive);
    if (!person) throw new HttpError(404, 'Član ne obstaja.');
    const condition = { _id: req.household._id, members: { $elemMatch: { id, inactive: { $ne: true } } } };
    if (action === 'planning') {
      const { familyRole, availability, unavailableUntil = null } = req.body;
      if (!familyRoles.has(familyRole) || !availabilityStates.has(availability) ||
          (unavailableUntil !== null && !isDay(unavailableUntil))) throw new HttpError(400, 'Preveri vlogo in datum odsotnosti.');
      await households.updateOne(condition, { $set: {
        'members.$.familyRole': familyRole, 'members.$.availability': availability,
        'members.$.unavailableUntil': availability === 'available' ? null : unavailableUntil,
      } });
      return res.json({ ok: true });
    }
    if (isAdmin(req.household, person)) throw new HttpError(403, 'Skrbnikovih pravic ni mogoče spremeniti.');
    if (action === 'permissions') {
      if (!Object.keys(defaultPermissions).every(key => typeof req.body[key] === 'boolean')) {
        throw new HttpError(400, 'Izberi veljavne pravice člana.');
      }
      const permissions = Object.fromEntries(Object.keys(defaultPermissions).map(key => [key, req.body[key]]));
      await households.updateOne(condition, { $set: { 'members.$.permissions': permissions } });
    } else if (action === 'deny') {
      await households.updateOne(condition, { $unset: { 'members.$.leaveRequestedAt': '' } });
    } else if (action === 'remove') {
      await households.updateOne(condition, {
        $set: { 'members.$.inactive': true },
        $unset: { 'members.$.accountId': '', 'members.$.guestAccountId': '', 'members.$.sessionHash': '', 'members.$.expiresAt': '', 'members.$.leaveRequestedAt': '' },
      });
    } else {
      throw new HttpError(404, 'To dejanje ne obstaja.');
    }
    res.json({ ok: true });
  });

  router.post('/planning/:action', async (req, res) => {
    requireAdmin(req);
    const { action } = req.params;
    const { rebalance = false, signature } = req.body;
    if (!['preview', 'apply'].includes(action) || typeof rebalance !== 'boolean') {
      throw new HttpError(400, 'Neveljavna zahteva za razporeditev.');
    }
    const householdId = req.household._id;
    const tasks = await entries.find({ householdId, archivedAt: null, kind: 'task' }, {
      projection: { title: 1, category: 1, dueOn: 1, completedAt: 1, assigneeId: 1, version: 1 },
    }).toArray();
    const plan = planTasks(tasks, req.household.members, householdDay(), rebalance);
    const fingerprint = hash(JSON.stringify(plan));
    if (action === 'preview') {
      return res.json({
        changes: plan.changes.map(({ id, title, assigneeName }) => ({ id, title, assigneeName })),
        skipped: plan.skipped, until: plan.until, signature: fingerprint,
      });
    }
    if (signature !== fingerprint) throw new HttpError(409, 'Opravila ali razpoložljivost so se spremenili. Pripravi nov predlog.');
    if (!plan.changes.length) return res.json({ applied: 0, conflicts: 0 });
    const now = new Date();
    const result = await entries.bulkWrite(plan.changes.map(change => ({
      updateOne: {
        filter: {
          _id: new ObjectId(change.id), householdId, archivedAt: null, kind: 'task', completedAt: null,
          assigneeId: change.previousAssigneeId, version: change.version,
        },
        update: { $set: { assigneeId: change.assigneeId, assignedAt: now, coverRequestedAt: null }, $inc: { version: 1 } },
      },
    })));
    res.json({ applied: result.modifiedCount, conflicts: plan.changes.length - result.modifiedCount });
  });

  router.post('/whatsapp/pair', async (req, res) => {
    requireAdmin(req);
    if (!whatsappEnabled) throw new HttpError(404, 'WhatsApp še ni nastavljen.');
    const code = randomBytes(12).toString('hex');
    await households.updateOne({ _id: req.household._id }, { $set: {
      whatsappPairing: { hash: codeHash(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    } });
    res.json({ code });
  });

  router.post('/whatsapp/unlink', async (req, res) => {
    requireAdmin(req);
    if (!whatsappEnabled) throw new HttpError(404, 'WhatsApp še ni nastavljen.');
    await households.updateOne({ _id: req.household._id }, { $unset: { whatsappSender: '', whatsappPairing: '' } });
    res.json({ ok: true });
  });

  function entryFields(req) {
    const { kind, dueOn = null, category = 'drugo', repeatDays = 0, rotate = false, reminderDays = 2 } = req.body;
    if (kind !== 'task' && kind !== 'event') throw new HttpError(400, 'Izberi opravilo ali dogodek.');
    const title = requiredText(req.body.title, 160, 'Naslov');
    if (!categories.has(category)) throw new HttpError(400, 'Izberi veljavno kategorijo.');
    if (dueOn !== null && !isDay(dueOn)) throw new HttpError(400, 'Izberi veljaven datum.');
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
    if (assigneeId !== null && !req.household.members.some(member => member.id === assigneeId && !member.inactive)) {
      throw new HttpError(400, 'Izberi člana tega prostora.');
    }
    return { kind, title, dueOn, category, assigneeId, repeatDays, rotate, reminderDays };
  }

  router.post('/entries', async (req, res) => {
    if (!access(req.household, req.member).create) throw new HttpError(403, 'Nimaš dovoljenja za dodajanje vnosov.');
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
    const rights = access(req.household, req.member);
    if (action === 'remove' && !rights.remove) throw new HttpError(403, 'Nimaš dovoljenja za odstranjevanje vnosov.');
    if (action === 'edit' && !rights.move && !rights.edit) throw new HttpError(403, 'Nimaš dovoljenja za urejanje.');
    if (req.body.version !== (entry.version ?? 0)) {
      throw new HttpError(409, 'Vnos se je spremenil. Zapri obrazec in ga znova odpri.');
    }
    const fields = action === 'remove' ? { archivedAt: new Date() } : entryFields(req);
    if (action === 'edit' && fields.kind !== entry.kind) throw new HttpError(400, 'Vrste vnosa ni mogoče spremeniti.');
    if (action === 'edit' && fields.dueOn !== entry.dueOn && !rights.move) {
      throw new HttpError(403, 'Nimaš dovoljenja za premikanje datumov.');
    }
    if (action === 'edit' && !rights.edit) {
      for (const [key, value] of Object.entries(fields)) {
        const original = key === 'assigneeId' && req.household.members.some(person => person.id === entry.assigneeId && person.inactive)
          ? null : entry[key] ?? { repeatDays: 0, rotate: false, reminderDays: 2, assigneeId: null }[key];
        if (key !== 'dueOn' && value !== original) {
          throw new HttpError(403, 'Dovoljenje velja samo za spremembo datuma.');
        }
      }
    }
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
      ...task, completedAt: null, assigneeId: action === 'claim'
        ? { $in: [null, ...req.household.members.filter(member => member.inactive).map(member => member.id)] }
        : req.member.id,
    };
    if (action === 'complete') {
      const current = await entries.findOne(condition, { projection: { voice: 0 } });
      if (!current) throw new HttpError(409, 'Stanje opravila se je spremenilo ali pa dejanje ni na voljo.');
      condition.version = current.version ?? null;
      const next = nextOccurrence(current, req.household.members.filter(member => !member.inactive));
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
