export const familyRoles = new Set(['father', 'mother', 'guardian', 'child', 'other']);
export const availabilityStates = new Set(['available', 'sick', 'unavailable']);
const estimate = task => task.estimatedMinutes ?? 30;
const childCategories = new Set(['dom', 'druzina', 'drugo']);

export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

export function householdDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDay(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function available(person, today) {
  return !person.inactive && (!person.availability || person.availability === 'available' ||
    (person.unavailableUntil && person.unavailableUntil < today));
}

export function planTasks(tasks, people, today, rebalance) {
  const until = shiftDay(today, 6);
  const since = shiftDay(today, -14);
  const members = people.filter(person => available(person, today)).map(person => ({
    ...person, load: 0, capacity: person.familyRole === 'child' ? 0.5 : 1,
  }));
  const byId = new Map(members.map(member => [member.id, member]));
  const candidates = [];
  for (const task of tasks) {
    const assigned = byId.get(task.assigneeId);
    if (task.completedAt) {
      if (assigned && task.completedAt.toISOString().slice(0, 10) >= since) assigned.load += estimate(task) / 4;
    } else if ((!task.dueOn || task.dueOn <= until) && (rebalance || !assigned)) {
      candidates.push(task);
    } else if (assigned) {
      assigned.load += estimate(task);
    }
  }
  candidates.sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999') ||
    estimate(b) - estimate(a) || String(a._id).localeCompare(String(b._id)));

  const changes = [];
  let skipped = 0;
  for (const task of candidates) {
    const eligible = members.filter(member => member.familyRole !== 'child' || childCategories.has(task.category));
    if (!eligible.length) {
      skipped++;
      continue;
    }
    const effort = estimate(task);
    eligible.sort((a, b) => (a.load + effort) / a.capacity - (b.load + effort) / b.capacity ||
      Number(b.id === task.assigneeId) - Number(a.id === task.assigneeId) || a.load - b.load || a.id.localeCompare(b.id));
    const next = eligible[0];
    next.load += effort;
    if (next.id !== task.assigneeId) {
      changes.push({
        id: String(task._id), title: task.title, assigneeId: next.id, assigneeName: next.name,
        previousAssigneeId: task.assigneeId ?? null, version: task.version ?? null,
      });
    }
  }
  return { until, skipped, changes };
}
