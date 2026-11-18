import { addDays, dateKey, fromKey } from './data.js';

export function eventBlock(entry, day) {
  if (!entry.startTime) return null;
  const [hour, minute] = entry.startTime.split(':').map(Number);
  const start = hour * 60 + minute;
  const end = entry.durationMinutes == null ? null : start + entry.durationMinutes;
  if (entry.dueOn === day) return { start, end: end === null ? null : Math.min(1440, end) };
  if (end > 1440 && dateKey(addDays(fromKey(entry.dueOn), 1)) === day) return { start: 0, end: end - 1440 };
  return null;
}

export function clockTime(minutes) {
  const pad = (value) => String(value).padStart(2, '0');
  return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
}
