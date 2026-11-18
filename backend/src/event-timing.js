import { HttpError } from './api-errors.js';

export function eventTiming(body, previous) {
  const supplied = ['allDay', 'startTime', 'durationMinutes'].some((key) => Object.hasOwn(body, key));
  if (body.kind === 'task') {
    if (body.allDay != null || body.startTime != null || body.durationMinutes != null) {
      throw new HttpError(400, 'Čas in trajanje nastavi samo za dogodek.');
    }
    return {};
  }
  if (!supplied && previous) return timingOf(previous);
  const { startTime = null, durationMinutes = null, allDay = startTime === null } = body;
  if (
    typeof allDay !== 'boolean' ||
    (allDay && (startTime !== null || durationMinutes !== null)) ||
    (!allDay && (typeof startTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime))) ||
    (durationMinutes !== null &&
      (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440))
  ) {
    throw new HttpError(400, 'Izberi veljaven začetni čas in trajanje do 1440 minut.');
  }
  return { allDay, startTime, durationMinutes };
}

export function timingOf(entry) {
  return {
    allDay: entry.startTime == null,
    startTime: entry.startTime ?? null,
    durationMinutes: entry.durationMinutes ?? null,
  };
}
