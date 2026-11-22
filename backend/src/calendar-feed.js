import { randomBytes } from 'node:crypto';
import { HttpError } from './api-errors.js';
import { hash } from './mobile-auth.js';
import { isDay } from './planning.js';

const zone = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Ljubljana', timeZoneName: 'shortOffset' });
const stamp = (date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');
const escapeText = (value) =>
  value.replace(/[\\,;\r\n]/g, (character) => ({ '\r': '', '\n': '\\n' })[character] ?? '\\' + character);

function fold(line) {
  let bytes = 0;
  let result = '';
  for (const char of line) {
    const length = Buffer.byteLength(char);
    if (bytes + length > 75) {
      result += '\r\n ';
      bytes = 1;
    }
    result += char;
    bytes += length;
  }
  return result;
}

function offset(time) {
  const name = zone.formatToParts(time).find((value) => value.type === 'timeZoneName').value;
  const [, sign, hours, minutes = 0] = /^GMT([+-])(\d+)(?::(\d+))?$/.exec(name) ?? ['', '+', '0'];
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}

function timeInLjubljana(day, time) {
  const local = Date.parse(day + 'T' + time + ':00Z');
  const earlier = local - offset(local - 86_400_000);
  // At spring-forward gaps use the pre-transition offset. At repeated times prefer the first occurrence.
  return earlier + offset(earlier) > local ? earlier : local - offset(earlier);
}

export function calendarFeed(entries) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sotovor//Family calendar//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const entry of entries) {
    if (!isDay(entry.dueOn) || !['event', 'task'].includes(entry.kind)) continue;
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + entry._id + '@calendar.sotovor',
      'DTSTAMP:' + stamp(entry.createdAt ?? entry._id.getTimestamp()),
      'SUMMARY:' + escapeText(entry.title),
    );
    if (entry.kind === 'event' && entry.startTime) {
      const start = timeInLjubljana(entry.dueOn, entry.startTime);
      lines.push('DTSTART:' + stamp(new Date(start)));
      if (entry.durationMinutes)
        lines.push('DTEND:' + stamp(new Date(start + entry.durationMinutes * 60_000)));
    } else {
      lines.push('DTSTART;VALUE=DATE:' + entry.dueOn.replaceAll('-', ''));
      if (entry.kind === 'task') lines.push('CATEGORIES:TASK');
    }
    lines.push('END:VEVENT');
  }
  return lines.concat('END:VCALENDAR', '').map(fold).join('\r\n');
}

export function registerCalendarFeed(router, { accounts, households, entries }, billing) {
  router.get('/calendar/feed/:file', async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const token = /^([a-f0-9]{64})\.ics$/.exec(req.params.file)?.[1];
    if (!token) throw new HttpError(404, 'Koledar ni dostopen.');
    const owner = await accounts.findOne(
      { calendarTokenHash: hash(token), deletionFamilyIds: { $exists: false } },
      { projection: { _id: 1 } },
    );
    if (!owner) throw new HttpError(404, 'Koledar ni dostopen.');
    let families = await households
      .find(
        {
          members: {
            $elemMatch: {
              inactive: { $ne: true },
              $or: [{ accountId: owner._id }, { guestAccountId: owner._id }],
            },
          },
        },
        { projection: { _id: 1 } },
      )
      .toArray();
    if (billing?.config.enabled) {
      const allowed = await Promise.all(
        families.map(async (space) => (await billing.entitlements(space)).features.ics),
      );
      const original = families;
      families = families.filter((_space, index) => allowed[index]);
      if (!families.length && original.length) await billing.assertFeature(original[0], 'ics');
    }
    const items = await entries
      .find(
        {
          householdId: { $in: families.map((family) => family._id) },
          archivedAt: null,
          dueOn: { $type: 'string' },
        },
        { projection: { title: 1, dueOn: 1, kind: 1, startTime: 1, durationMinutes: 1, createdAt: 1 } },
      )
      .sort({ dueOn: 1, _id: 1 })
      .toArray();
    res.type('text/calendar').send(calendarFeed(items));
  });
}

export function registerCalendarSettings(router, { accounts }, billing) {
  router.get('/calendar/subscription', (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    res.json({ active: Boolean(req.account.calendarTokenHash) });
  });
  router.post('/calendar/subscription', async (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    if (billing?.config.enabled) {
      if (!req.household) throw new HttpError(401, 'Najprej se pridruži družinskemu prostoru.');
      await billing.assertFeature(req.household, 'ics');
    }
    const token = randomBytes(32).toString('hex');
    const result = await accounts.updateOne(
      { _id: req.account._id, deletionFamilyIds: { $exists: false } },
      { $set: { calendarTokenHash: hash(token) } },
    );
    if (!result.matchedCount) throw new HttpError(401, 'Najprej se prijavi.');
    res.status(201).json({ active: true, path: '/api/v1/calendar/feed/' + token + '.ics' });
  });
  router.delete('/calendar/subscription', async (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    await accounts.updateOne({ _id: req.account._id }, { $unset: { calendarTokenHash: '' } });
    res.json({ active: false });
  });
}
