import { useState } from 'react';
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheckBig,
  Clock3, Hand, ListTodo, Pencil, Plus, UsersRound,
} from 'lucide-react';
import { addDays, categories, dateKey, fromKey, initials, needsReminder, shortDate, voiceUrl, weekday } from './data.js';

export function Avatar({ name, index = 0 }) {
  return <span aria-hidden="true" className={`avatar tone-${index % 4}`}>{initials(name)}</span>;
}

export function Metrics({ tasks, memberId, today, onFilter }) {
  const open = tasks.filter(task => !task.completedAt);
  const metrics = [
    ['Moja odprta opravila', open.filter(task => task.assigneeId === memberId).length, ListTodo, 'mine'],
    ['Na voljo za prevzem', open.filter(task => !task.assigneeId).length, Hand, 'available'],
    ['Opomniki za roke', open.filter(task => needsReminder(task, today)).length, Clock3, 'due'],
  ];
  return <div className="metrics">{metrics.map(([label, count, Icon, filter]) =>
    <button type="button" className="metric panel" key={filter} onClick={() => onFilter(filter)}>
      <span className={`metric-icon ${filter}`}><Icon size={20} /></span>
      <span><strong>{count}</strong><span>{label}</span></span>
      <ArrowRight className="metric-arrow" size={17} aria-hidden="true" />
    </button>)}</div>;
}

const filters = { all: 'Odprta', mine: 'Moja', available: 'Za prevzem', due: 'Rok blizu', done: 'Zaključena' };

export function Tasks({ tasks, members, memberId, today, filter, onFilter, onAction, busy, onAdd, onEdit }) {
  const [pagination, setPagination] = useState({ filter, page: 1 });
  const names = new Map(members.map(member => [member.id, member.name]));
  const filtered = tasks.filter(task => {
    if (filter === 'done') return Boolean(task.completedAt);
    if (task.completedAt) return false;
    if (filter === 'mine') return task.assigneeId === memberId;
    if (filter === 'available') return !task.assigneeId;
    if (filter === 'due') return needsReminder(task, today);
    return true;
  }).sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999'));
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pagination.filter === filter ? pagination.page : 1, totalPages);
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);

  return <section className="panel task-panel">
    <div className="panel-heading"><div><h2>Družinska opravila</h2><p>Dogovorite se, kdo kaj prevzame.</p></div><ListTodo aria-hidden="true" size={22} /></div>
    <div className="filters" aria-label="Filtri opravil">
      {Object.entries(filters).map(([key, label]) =>
        <button type="button" key={key} aria-pressed={filter === key} onClick={() => {
          setPagination({ filter: key, page: 1 });
          onFilter(key);
        }}>{label}</button>)}
    </div>
    {filtered.length ? <ul className="task-list">{shown.map(task => {
      const due = task.dueOn && shortDate.format(fromKey(task.dueOn));
      const overdue = !task.completedAt && task.dueOn && task.dueOn < today;
      return <li key={task.id} className="task-row">
        <span className={`task-icon ${task.completedAt ? 'done' : ''}`}>
          {task.completedAt ? <Check size={18} /> : <ListTodo size={18} />}
        </span>
        <div className="task-info">
          <strong>{task.title}</strong>
          <p>{names.get(task.assigneeId) || 'Na voljo za prevzem'}{due && <span className={needsReminder(task, today) ? 'overdue' : ''}> · {overdue ? 'V zamudi, ' : ''}{due}</span>}{task.repeatDays > 0 && <span> · Vsakih {task.repeatDays} dni{task.rotate ? ' · Rotacija' : ''}</span>}</p>
        </div>
        <span className="tag">{categories[task.category]}</span>
        <div className="row-actions">
          {!task.completedAt && onEdit && <button className="icon-button" aria-label={`Uredi ${task.title}`} onClick={() => onEdit(task)}><Pencil size={16} /></button>}
          {!task.completedAt && !task.assigneeId && <button className="soft-button" disabled={busy} onClick={() => onAction(task.id, 'claim')}>Prevzemi</button>}
          {!task.completedAt && task.assigneeId === memberId && <>
            <button className="soft-button" disabled={busy} onClick={() => onAction(task.id, 'cover')}>Prosi za zamenjavo</button>
            <button className="icon-button" aria-label={`Zaključi ${task.title}`} title="Zaključi" disabled={busy} onClick={() => onAction(task.id, 'complete')}><Check size={19} /></button>
          </>}
        </div>
        {task.voice && <audio className="task-audio" controls preload="none" src={voiceUrl(task.id)} aria-label={`Glasovna beležka: ${task.title}`} />}
      </li>;
    })}</ul> : <div className="empty">
      <span className="empty-icon">{filter === 'done' ? <CircleCheckBig /> : <ListTodo />}</span>
      <strong>{tasks.length ? 'V tem pogledu ni opravil' : 'Začnite s prvim opravilom'}</strong>
      <p>{tasks.length ? 'Izberi drug filter za več opravil.' : 'Dodaj nekaj, kar bi radi uredili skupaj.'}</p>
      {!tasks.length && onAdd && <button className="soft-button" onClick={onAdd}><Plus size={17} /> Dodaj opravilo</button>}
    </div>}
    {totalPages > 1 && <nav className="task-pagination" aria-label="Strani opravil">
      <button className="icon-button" disabled={page === 1} aria-label="Prejšnja stran opravil" onClick={() => setPagination({ filter, page: page - 1 })}><ChevronLeft size={17} /></button>
      <span aria-live="polite">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} od {filtered.length}</span>
      <button className="icon-button" disabled={page === totalPages} aria-label="Naslednja stran opravil" onClick={() => setPagination({ filter, page: page + 1 })}><ChevronRight size={17} /></button>
    </nav>}
  </section>;
}

export function Calendar({ entries, today, compact, onOpen, onAdd, onEdit }) {
  const [offset, setOffset] = useState(0);
  const now = fromKey(today);
  const monday = addDays(now, -((now.getDay() + 6) % 7) + offset * 7);
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const week = entries.filter(entry => entry.dueOn && entry.dueOn >= dateKey(monday) && entry.dueOn <= dateKey(sunday));
  const rangeStart = shortDate.format(monday) + (monday.getFullYear() !== sunday.getFullYear() ? ` ${monday.getFullYear()}` : '');
  return <section className={`panel calendar ${compact ? 'compact' : ''}`}>
    <div className="panel-heading">
      <div><h2>{compact ? 'Ta teden' : 'Tedenski koledar'}</h2><p>{rangeStart} – {shortDate.format(sunday)} {sunday.getFullYear()}</p></div>
      {compact ? <CalendarDays size={22} aria-hidden="true" /> : <div className="week-controls">
        <button className="icon-button" aria-label="Prejšnji teden" onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></button>
        <button className="soft-button" onClick={() => setOffset(0)}>Danes</button>
        <button className="icon-button" aria-label="Naslednji teden" onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></button>
      </div>}
    </div>
    <ol className="week">
      {days.map(day => {
        const key = dateKey(day);
        const items = week.filter(entry => entry.dueOn === key);
        return <li key={key} className={key === today ? 'today' : ''}>
          <span>{weekday.format(day)}</span><strong>{day.getDate()}</strong>
          {compact ? <span className={items.length ? 'day-dot' : 'day-dot empty-dot'} /> :
            <ul className="day-entries">{items.map(entry => <li key={entry.id} className={entry.kind}>
              <span>{entry.kind === 'event' ? 'Dogodek' : entry.completedAt ? 'Zaključeno' : 'Opravilo'}</span>
              {entry.completedAt || !onEdit ? entry.title : <button className="calendar-edit" onClick={() => onEdit(entry)} aria-label={`Uredi ${entry.title}`}>{entry.title}</button>}
              {entry.voice && (window.sotovorDesktop
                ? <audio className="voice-link desktop-audio" controls preload="none" src={voiceUrl(entry.id)} aria-label={`Glasovna beležka: ${entry.title}`} />
                : <a className="voice-link" href={voiceUrl(entry.id)} target="_blank" rel="noreferrer">Poslušaj</a>)}
            </li>)}</ul>}
        </li>;
      })}
    </ol>
    {compact && <><p className="calendar-caption">{week.length ? `Vnosov ta teden: ${week.length}` : 'Ta teden še ni vnosov.'}</p>
      <button className="text-button" onClick={onOpen}>Odpri koledar <ArrowRight size={16} /></button></>}
    {!compact && onAdd && <button className="text-button" onClick={onAdd}><Plus size={17} /> Dodaj dogodek</button>}
  </section>;
}

export function Workload({ members, tasks, memberId, compact, onOpen }) {
  const [days, setDays] = useState('30');
  const since = days === 'all' || compact ? 0 : +addDays(new Date(), -Number(days));
  const rows = members.map((member, index) => {
    const assigned = tasks.filter(task => task.assigneeId === member.id);
    const done = assigned.filter(task => task.completedAt && Date.parse(task.completedAt) >= since).length;
    return { ...member, index, done, open: assigned.filter(task => !task.completedAt).length };
  });
  const max = Math.max(1, ...rows.map(row => row.open + row.done));
  return <section className="panel workload">
    <div className="panel-heading"><div><h2>Razporeditev dela</h2><p>Opravila po družinskih članih</p></div><UsersRound size={22} aria-hidden="true" /></div>
    {!compact && <label className="workload-filter">Obdobje za zaključena opravila
      <select value={days} onChange={event => setDays(event.target.value)}>
        <option value="7">Zadnjih 7 dni</option><option value="30">Zadnjih 30 dni</option><option value="all">Vse od začetka</option>
      </select>
    </label>}
    <ul className="load-list">{rows.map(row => <li key={row.id}>
      <Avatar name={row.name} index={row.index} />
      <div><strong>{row.name}{row.id === memberId && <span> · ti</span>}</strong>
        <div className="load-bar" aria-hidden="true"><span style={{ width: `${row.done / max * 100}%` }} /><span style={{ width: `${row.open / max * 100}%` }} /></div>
        <p>{row.open} odprtih · {row.done} zaključenih</p>
      </div>
    </li>)}</ul>
    {!compact && <p className="muted workload-unassigned">Brez odgovornega člana: {tasks.filter(task => !task.assigneeId && !task.completedAt).length}</p>}
    {compact && <button className="text-button" onClick={onOpen}>Poglej razporeditev <ArrowRight size={16} /></button>}
  </section>;
}
