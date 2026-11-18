import { ObjectId } from 'mongodb';

export function nextOccurrence(task, members) {
  const { repeatDays, rotate } = task;
  if (!repeatDays) return null;
  const date = new Date(task.dueOn);
  date.setUTCDate(date.getUTCDate() + repeatDays);
  if (date.getUTCFullYear() > 9999) return null;
  const current = members.findIndex(member => member.id === task.assigneeId);
  return {
    _id: new ObjectId(),
    householdId: task.householdId,
    kind: 'task',
    title: task.title,
    category: task.category,
    dueOn: date.toISOString().slice(0, 10),
    assigneeId: rotate ? members[(current + 1) % members.length].id : task.assigneeId,
    assignedAt: new Date(),
    repeatDays, rotate,
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
  for await (const task of entries.find({ householdId, nextOccurrence: { $exists: true } }, {
    projection: { nextOccurrence: 1 },
  })) {
    const { _id, ...fields } = task.nextOccurrence;
    await entries.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    await entries.updateOne({ _id: task._id }, { $unset: { nextOccurrence: '' } });
  }
}
