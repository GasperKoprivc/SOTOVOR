import { HttpError } from './api-errors.js';
import { householdDay } from './planning.js';

export function taskFilters(query, household, member) {
  const { state = 'all', search, category, assignee } = query;
  if (!['all', 'mine', 'available', 'due', 'recurring', 'done'].includes(state) ||
      (search !== undefined && (typeof search !== 'string' || search.length > 160)) ||
      (category !== undefined && !['dom', 'druzina', 'opravki', 'zdravje', 'drugo'].includes(category))) {
    throw new HttpError(400, 'Preveri filtre opravil.');
  }
  const unassigned = { $in: [null, ...household.members.filter(person => person.inactive).map(person => person.id)] };
  const conditions = [{ completedAt: state === 'done' ? { $ne: null } : null }];
  if (search?.trim()) conditions.push({ title: new RegExp(RegExp.escape(search.trim()), 'iu') });
  if (category) conditions.push({ category });
  if (assignee !== undefined) {
    if (assignee !== 'unassigned' && !household.members.some(person => person.id === assignee)) {
      throw new HttpError(400, 'Izberi člana tega prostora.');
    }
    conditions.push({ assigneeId: assignee === 'unassigned' ? unassigned : assignee });
  }
  if (state === 'mine') conditions.push({ assigneeId: member.id });
  if (state === 'available') conditions.push({ assigneeId: unassigned });
  if (state === 'recurring') conditions.push({ repeatDays: { $gt: 0 } });
  if (state === 'due') conditions.push({
    dueOn: { $type: 'string' },
    $expr: { $lte: [
      { $dateFromString: { dateString: '$dueOn', onError: new Date('9999-01-01') } },
      { $dateAdd: { startDate: new Date(householdDay()), unit: 'day', amount: { $ifNull: ['$reminderDays', 2] } } },
    ] },
  });
  return { $and: conditions };
}
