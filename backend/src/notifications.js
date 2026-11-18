import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { hash, validId } from './mobile-auth.js';
import { pageOf } from './paging.js';
import { householdDay } from './planning.js';

const defaults = { assignments: true, reminders: true, swaps: true };
const objectId = (value) => new ObjectId(value);
const publicNotice = ({ _id, type, target, createdAt, readAt }) => ({
  id: String(_id),
  type,
  target,
  createdAt,
  readAt: readAt ?? null,
});
const account = (req) => {
  if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
  return req.account._id;
};
const noticeScope = (req) => {
  const accountId = account(req);
  if (!req.household) throw new HttpError(401, 'Najprej se pridruži družinskemu prostoru.');
  return { accountId, householdId: req.household._id };
};

export function registerNotificationRoutes(router, { accounts, devices, mobileSessions, notifications }) {
  router.get('/me/notification-settings', (req, res) => {
    account(req);
    res.json({ ...defaults, ...req.account.notificationSettings });
  });
  router.put('/me/notification-settings', async (req, res) => {
    const accountId = account(req);
    if (!Object.keys(defaults).every((key) => typeof req.body[key] === 'boolean')) {
      throw new HttpError(400, 'Izberi veljavne nastavitve obvestil.');
    }
    const settings = Object.fromEntries(Object.keys(defaults).map((key) => [key, req.body[key]]));
    await accounts.updateOne({ _id: accountId }, { $set: { notificationSettings: settings } });
    res.json(settings);
  });
  router.post('/devices', async (req, res) => {
    const accountId = account(req);
    if (!req.mobileSession) throw new HttpError(401, 'Prijavi se v mobilni aplikaciji.');
    const { token, platform, appVersion, locale, widgetRefresh = false } = req.body;
    if (
      typeof token !== 'string' ||
      !/^[\w:.-]{10,4096}$/.test(token) ||
      typeof widgetRefresh !== 'boolean' ||
      platform !== 'android' ||
      typeof appVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(appVersion) ||
      typeof locale !== 'string' ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ||
      locale.length > 35
    ) {
      throw new HttpError(400, 'Preveri podatke naprave.');
    }
    const sessionId = req.mobileSession._id;
    const device = await devices.findOneAndUpdate(
      { token },
      {
        $set: {
          accountId,
          sessionId,
          platform,
          appVersion,
          locale,
          widgetRefresh,
          updatedAt: new Date(),
          expiresAt: req.mobileSession.expiresAt,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!(await mobileSessions.findOne({ _id: sessionId }, { projection: { _id: 1 } }))) {
      await devices.deleteOne({ _id: device._id, sessionId });
      throw new HttpError(401, 'Seja je bila preklicana.');
    }
    res.json({ id: String(device._id) });
  });
  router.delete('/devices/:id', async (req, res) => {
    const accountId = account(req);
    if (
      !validId(req.params.id) ||
      !(await devices.deleteOne({ _id: objectId(req.params.id), accountId })).deletedCount
    ) {
      throw new HttpError(404, 'Naprava ne obstaja.');
    }
    res.json({ ok: true });
  });
  router.get('/notifications', async (req, res) => {
    const scope = noticeScope(req);
    if (req.query.unread === 'true') scope.readAt = null;
    res.json(await pageOf(notifications, scope, req.query, { map: publicNotice }));
  });
  router.put('/notifications/:id/read', async (req, res) => {
    const scope = noticeScope(req);
    if (!validId(req.params.id)) throw new HttpError(404, 'Obvestilo ne obstaja.');
    const updated = await notifications.updateOne(
      { ...scope, _id: objectId(req.params.id) },
      { $set: { readAt: new Date() } },
    );
    if (!updated.matchedCount) throw new HttpError(404, 'Obvestilo ne obstaja.');
    res.json({ ok: true });
  });
}

function activeMembers(household) {
  return new Map(
    household.members
      .filter((member) => !member.inactive)
      .flatMap((member) => {
        const owner = member.id === household.ownerId ? household.ownerAccountId : null;
        const accountId = member.accountId ?? member.guestAccountId ?? owner;
        return accountId ? [[member.id, accountId]] : [];
      }),
  );
}

async function emitNotice(
  { accounts, notifications },
  push,
  now,
  accountId,
  householdId,
  type,
  entryId,
  key,
  preference,
) {
  if (!accountId) return;
  const person = await accounts.findOne(
    { _id: accountId },
    { projection: { passwordHash: 1, notificationSettings: 1 } },
  );
  if (!person || person.notificationSettings?.[preference] === false) return;
  const target = {
    screen: entryId ? 'task' : 'family',
    householdId: String(householdId),
    ...(entryId ? { entryId: String(entryId) } : {}),
  };
  try {
    await notifications.insertOne({
      accountId,
      householdId,
      type,
      target,
      createdAt: now,
      readAt: null,
      key: hash(JSON.stringify([String(accountId), String(householdId), type, String(entryId ?? ''), key])),
    });
  } catch (error) {
    if (error.code === 11000) return;
    throw error;
  }
  await push?.send(accountId, hash(person.passwordHash), { type, target });
}

export function taskCommentNotice(database, push) {
  return async (household, authorId, entryId, comment) => {
    for (const [memberId, accountId] of activeMembers(household)) {
      if (memberId !== authorId)
        await emitNotice(
          database,
          push,
          comment.createdAt,
          accountId,
          household._id,
          'task_comment',
          entryId,
          String(comment._id),
          'assignments',
        );
    }
  };
}

export async function produceNotifications(
  { households, entries, accounts, notifications },
  push,
  { now = new Date(), today = householdDay() } = {},
) {
  const recent = new Date(+now - 24 * 60 * 60_000);
  const ahead = new Date(today);
  ahead.setUTCDate(ahead.getUTCDate() + 30);
  const latestDay = ahead.toISOString().slice(0, 10);
  const emit = (...args) => emitNotice({ accounts, notifications }, push, now, ...args);
  for await (const family of households.find(
    {},
    { projection: { members: 1, ownerId: 1, ownerAccountId: 1 } },
  )) {
    const members = activeMembers(family);
    if (!members.size) continue;
    for (const member of family.members) {
      if (!member.inactive && member.joinedAt >= recent) {
        await emit(family.ownerAccountId, family._id, 'member_joined', null, member.id, 'assignments');
      }
    }
    const tasks = entries.find(
      {
        householdId: family._id,
        kind: 'task',
        archivedAt: null,
        completedAt: null,
        $or: [
          { assignedAt: { $gte: recent } },
          { coverRequestedAt: { $gte: recent } },
          { dueOn: { $lte: latestDay, $type: 'string' } },
        ],
      },
      {
        projection: {
          dueOn: 1,
          reminderDays: 1,
          assigneeId: 1,
          assignedAt: 1,
          coverRequestedAt: 1,
          coverRequestedBy: 1,
        },
      },
    );
    for await (const task of tasks) {
      const assignee = members.get(task.assigneeId);
      if (task.assignedAt >= recent)
        await emit(assignee, family._id, 'assignment', task._id, +task.assignedAt, 'assignments');
      if (task.coverRequestedAt >= recent) {
        for (const [memberId, accountId] of members) {
          if (memberId !== task.coverRequestedBy)
            await emit(accountId, family._id, 'swap', task._id, +task.coverRequestedAt, 'swaps');
        }
      }
      if (!assignee || !task.dueOn) continue;
      const days = (Date.parse(task.dueOn) - Date.parse(today)) / 86_400_000;
      if (days < 0) await emit(assignee, family._id, 'overdue', task._id, task.dueOn, 'reminders');
      else if (days <= (task.reminderDays ?? 2))
        await emit(assignee, family._id, 'deadline', task._id, task.dueOn, 'reminders');
    }
  }
}

export function scheduleNotifications(database, push, interval = 30_000) {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await produceNotifications(database, push);
    } catch (error) {
      console.error('Notification scan failed:', error.name);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, interval);
  timer.unref();
  return () => clearInterval(timer);
}
