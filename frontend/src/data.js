import { localizedDate, getLanguage } from './i18n.js';

export const categories = {
  dom: 'Dom',
  druzina: 'Družina',
  opravki: 'Opravki',
  zdravje: 'Zdravje',
  drugo: 'Drugo',
};

export const familyRoles = {
  father: 'Oče',
  mother: 'Mati',
  guardian: 'Skrbnik otroka',
  child: 'Otrok',
  other: 'Drugo',
};
export const availabilityStates = { available: 'Na voljo', sick: 'Bolan/a', unavailable: 'Odsoten/na' };

export const shortDate = localizedDate({ day: 'numeric', month: 'short' });
export const fullDate = localizedDate({ day: 'numeric', month: 'long', weekday: 'long' });
export const weekday = localizedDate({ weekday: 'short' });

export function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const fromKey = (key) => new Date(key + 'T12:00:00');
export const needsReminder = (task, today) =>
  !task.completedAt &&
  Boolean(task.dueOn) &&
  task.dueOn <= dateKey(addDays(fromKey(today), task.reminderDays ?? 2));
export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase();

let activeHousehold;

export function selectHousehold(id) {
  activeHousehold = id;
}

export function voiceUrl(id) {
  return `/api/entries/${id}/voice${activeHousehold ? '?household=' + activeHousehold : ''}`;
}

export async function request(
  path,
  body,
  signal,
  household = activeHousehold,
  method = body === undefined ? 'GET' : 'POST',
) {
  const headers = {
    'Accept-Language': getLanguage(),
    ...(household ? { 'X-Sotovor-Household': household } : {}),
  };
  const options =
    body === undefined
      ? { signal, headers }
      : {
          method,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
  const response = await fetch('/api' + path, options);
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.error === 'object' ? data.error : { message: data.error };
    if (detail.code === 'PLAN_REQUIRED')
      window.dispatchEvent(new CustomEvent('sotovor:plan-required', { detail: detail.details }));
    throw Object.assign(new Error(detail.code === 'PLAN_REQUIRED' ? '' : detail.message), {
      status: response.status,
      code: detail.code,
      details: detail.details,
    });
  }
  return data;
}
