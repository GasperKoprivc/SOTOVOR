import { t, localizedDate } from './i18n.js';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, dateKey, fromKey, fullDate, weekday } from './data.js';

const monthFormat = localizedDate({ month: 'long', year: 'numeric' });

export default function MonthCalendar({ entries, members, today, onEdit, onAdd }) {
  const [selected, setSelected] = useState(today);
  const focus = fromKey(selected);
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
  const numberOfDays = new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const monday = addDays(first, -leading);
  const cells = Math.ceil((leading + numberOfDays) / 7) * 7;
  const byDate = new Map();
  const names = new Map(members.map((member, i) => [member.id, { name: member.name, index: i }]));
  for (const entry of entries) {
    if (entry.dueOn) {
      if (!byDate.has(entry.dueOn)) byDate.set(entry.dueOn, []);
      byDate.get(entry.dueOn).push(entry);
    }
  }
  const selectedEntries = byDate.get(selected) || [];
  const moveMonth = delta => setSelected(dateKey(new Date(focus.getFullYear(), focus.getMonth() + delta, 1, 12)));

  return <section className="panel calendar month-calendar">
    <div className="panel-heading">
      <div><h2 aria-live="polite">{monthFormat.format(first)}</h2><p>{t('Izberi dan za celoten seznam opravil in dogodkov.')}</p></div>
      <div className="week-controls">
        <button className="icon-button" aria-label={t('Prejšnji mesec')} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
        <button className="soft-button" onClick={() => setSelected(today)}>{t('Danes')}</button>
        <button className="icon-button" aria-label={t('Naslednji mesec')} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="month-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => {
      const day = addDays(monday, index);
      return <span key={dateKey(day)}>{weekday.format(day)}</span>;
    })}</div>
    <ol className="month-grid" aria-label={t('Dnevi v mesecu')}>
      {Array.from({ length: cells }, (_, index) => {
        const day = addDays(first, index - leading);
        const key = dateKey(day);
        const items = byDate.get(key) || [];
        const adjacent = day.getMonth() !== focus.getMonth();
        return <li key={key}><button type="button" className={`month-day ${adjacent ? 'adjacent' : ''}`}
          aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined}
          aria-label={t("%0, vnosov: %1", fullDate.format(day), items.length)} onClick={() => setSelected(key)}>
          <span className="month-day-number">{day.getDate()}{items.length > 0 && <small>{items.length}</small>}</span>
          {items.slice(0, 2).map(entry => <span key={entry.id} className={`month-entry tone-${(names.get(entry.assigneeId)?.index ?? 0) % 4}`}>{entry.title}</span>)}
          {items.length > 2 && <span className="month-more">+{items.length - 2}{' '}{t('več')}</span>}
        </button></li>;
      })}
    </ol>
    <div className="month-agenda" key={selected}>
      <div className="panel-heading"><div><h2>{fullDate.format(focus)}</h2><p>{t('Vnosov:')}{' '}{selectedEntries.length}</p></div>
        {onAdd && <button className="soft-button" onClick={() => onAdd(selected)}><Plus size={17} />{' '}{t('Dodaj dogodek')}</button>}
      </div>
      {selectedEntries.length ? <ul>{selectedEntries.map(entry => {
        const assignee = names.get(entry.assigneeId);
        return <li key={entry.id}>
          <span className={`month-agenda-icon tone-${(assignee?.index ?? 0) % 4}`} aria-hidden="true"><CalendarDays size={17} /></span>
          <div><strong>{entry.title}</strong><p>{entry.kind === 'event' ? t('Dogodek') : assignee?.name || t('Na voljo za prevzem')}{entry.completedAt && t(' · Zaključeno')}</p></div>
          {onEdit && !entry.completedAt && <button className="soft-button" onClick={() => onEdit(entry)} aria-label={t("Uredi %0", entry.title)}>{t('Uredi')}</button>}
        </li>;
      })}</ul> : <p className="muted">{t('Za ta dan še ni vnosov.')}</p>}
    </div>
  </section>;
}
