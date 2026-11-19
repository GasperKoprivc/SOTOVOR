import { ObjectId } from 'mongodb';

export function normalizeRecurrence(value) {
  if (value == null) return null;
  if (
    value.type === 'weekly' &&
    Array.isArray(value.weekdays) &&
    value.weekdays.length >= 1 &&
    value.weekdays.length <= 7 &&
    value.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  ) {
    return { type: 'weekly', weekdays: [...new Set(value.weekdays)].sort((a, b) => a - b) };
  }
  if (
    value.type === 'monthly' &&
    Number.isInteger(value.dayOfMonth) &&
    value.dayOfMonth >= 1 &&
    value.dayOfMonth <= 31
  ) {
    return { type: 'monthly', dayOfMonth: value.dayOfMonth };
  }
  return undefined;
}

function monthDay(date, day) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(next.getUTCDate(), day));
  return next;
}

function followingDate(task) {
  const date = new Date(task.dueOn);
  if (task.recurrence?.type === 'weekly') {
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (!task.recurrence.weekdays.includes(date.getUTCDay() || 7));
    return date;
  }
  if (task.recurrence?.type === 'monthly') {
    const day = task.recurrence.dayOfMonth;
    const withinMonth = monthDay(date, day);
    if (withinMonth > date) return withinMonth;
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
    return monthDay(date, day);
  }
  date.setUTCDate(date.getUTCDate() + task.repeatDays);
  return date;
}

export function nextOccurrence(task, members) {
  const { repeatDays, recurrence, rotate } = task;
  if (!repeatDays && !recurrence) return null;
  const date = followingDate(task);
  if (date.getUTCFullYear() > 9999) return null;
  const current = members.findIndex((member) => member.id === task.assigneeId);
  return {
    _id: new ObjectId(),
    householdId: task.householdId,
    kind: 'task',
    title: task.title,
    category: task.category,
    dueOn: date.toISOString().slice(0, 10),
    assigneeId: rotate ? members[(current + 1) % members.length].id : task.assigneeId,
    assignedAt: new Date(),
    repeatDays,
    recurrence: recurrence ?? null,
    rotate,
    reminderDays: task.reminderDays ?? 2,
    points: task.points ?? null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    completedAt: null,
    createdAt: new Date(),
  };
}

// Completion and its successor are recorded together, even on standalone MongoDB.
// A later dashboard request can resume materialization after an interrupted write.
export async function materializeOccurrences(entries, householdId) {
  for await (const task of entries.find(
    { householdId, nextOccurrence: { $exists: true } },
    {
      projection: { nextOccurrence: 1 },
    },
  )) {
    const { _id, ...fields } = task.nextOccurrence;
    await entries.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    await entries.updateOne({ _id: task._id }, { $unset: { nextOccurrence: '' } });
  }
}
