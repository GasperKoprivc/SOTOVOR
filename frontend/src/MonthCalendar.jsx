import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, dateKey, fromKey, fullDate } from './data.js';

const monthFormat = new Intl.DateTimeFormat('sl-SI', { month: 'long', year: 'numeric' });
const days = ['Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob', 'Ned'];

export default function MonthCalendar({ entries, members, today, onEdit, onAdd }) {
  const [selected, setSelected] = useState(today);
  const focus = fromKey(selected);
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
  const numberOfDays = new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
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
      <div><h2 aria-live="polite">{monthFormat.format(first)}</h2><p>Izberi dan za celoten seznam opravil in dogodkov.</p></div>
      <div className="week-controls">
        <button className="icon-button" aria-label="Prejšnji mesec" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
        <button className="soft-button" onClick={() => setSelected(today)}>Danes</button>
        <button className="icon-button" aria-label="Naslednji mesec" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="month-weekdays" aria-hidden="true">{days.map(day => <span key={day}>{day}</span>)}</div>
    <ol className="month-grid" aria-label="Dnevi v mesecu">
      {Array.from({ length: cells }, (_, index) => {
        const day = addDays(first, index - leading);
        const key = dateKey(day);
        const items = byDate.get(key) || [];
        const adjacent = day.getMonth() !== focus.getMonth();
        return <li key={key}><button type="button" className={`month-day ${adjacent ? 'adjacent' : ''}`}
          aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined}
          aria-label={`${fullDate.format(day)}, vnosov: ${items.length}`} onClick={() => setSelected(key)}>
          <span className="month-day-number">{day.getDate()}{items.length > 0 && <small>{items.length}</small>}</span>
          {items.slice(0, 2).map(entry => <span key={entry.id} className={`month-entry tone-${(names.get(entry.assigneeId)?.index ?? 0) % 4}`}>{entry.title}</span>)}
          {items.length > 2 && <span className="month-more">+{items.length - 2} več</span>}
        </button></li>;
      })}
    </ol>
    <div className="month-agenda" key={selected}>
      <div className="panel-heading"><div><h2>{fullDate.format(focus)}</h2><p>Vnosov: {selectedEntries.length}</p></div>
        {onAdd && <button className="soft-button" onClick={() => onAdd(selected)}><Plus size={17} /> Dodaj dogodek</button>}
      </div>
      {selectedEntries.length ? <ul>{selectedEntries.map(entry => {
        const assignee = names.get(entry.assigneeId);
        return <li key={entry.id}>
          <span className={`month-agenda-icon tone-${(assignee?.index ?? 0) % 4}`} aria-hidden="true"><CalendarDays size={17} /></span>
          <div><strong>{entry.title}</strong><p>{entry.kind === 'event' ? 'Dogodek' : assignee?.name || 'Na voljo za prevzem'}{entry.completedAt && ' · Zaključeno'}</p></div>
          {onEdit && !entry.completedAt && <button className="soft-button" onClick={() => onEdit(entry)} aria-label={`Uredi ${entry.title}`}>Uredi</button>}
        </li>;
      })}</ul> : <p className="muted">Za ta dan še ni vnosov.</p>}
    </div>
  </section>;
}
