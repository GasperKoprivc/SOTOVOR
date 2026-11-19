import { clockTime, eventBlock } from './event-time.js';
import { t } from './i18n.js';
import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  Hand,
  ListTodo,
  Pencil,
  Plus,
  UsersRound,
} from 'lucide-react';
import {
  addDays,
  categories,
  dateKey,
  fromKey,
  initials,
  needsReminder,
  shortDate,
  voiceUrl,
  weekday,
} from './data.js';

export function Avatar({ name, index = 0 }) {
  return (
    <span aria-hidden="true" className={`avatar tone-${index % 4}`}>
      {initials(name)}
    </span>
  );
}

export function Metrics({ tasks, memberId, today, onFilter }) {
  const open = tasks.filter((task) => !task.completedAt);
  const metrics = [
    [t('Moja odprta opravila'), open.filter((task) => task.assigneeId === memberId).length, ListTodo, 'mine'],
    [t('Na voljo za prevzem'), open.filter((task) => !task.assigneeId).length, Hand, 'available'],
    [t('Opomniki za roke'), open.filter((task) => needsReminder(task, today)).length, Clock3, 'due'],
  ];
  return (
    <div className="metrics">
      {metrics.map(([label, count, Icon, filter]) => (
        <button type="button" className="metric panel" key={filter} onClick={() => onFilter(filter)}>
          <span className={`metric-icon ${filter}`}>
            <Icon size={20} />
          </span>
          <span>
            <strong>{count}</strong>
            <span>{t(label)}</span>
          </span>
          <ArrowRight className="metric-arrow" size={17} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

const filters = {
  all: 'Odprta',
  mine: 'Moja',
  available: 'Za prevzem',
  due: 'Rok blizu',
  recurring: 'Ponavljajoča',
  done: 'Zaključena',
};

export function Tasks({
  tasks,
  members,
  memberId,
  today,
  filter,
  onFilter,
  onAction,
  busy,
  onAdd,
  onEdit,
  onDetails,
}) {
  const [pagination, setPagination] = useState({ filter, page: 1 });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [assignee, setAssignee] = useState('');
  const names = new Map(members.map((member) => [member.id, member.name]));
  const term = search.trim().toLowerCase();
  const filtered = tasks
    .filter((task) => {
      if (category && task.category !== category) return false;
      if (assignee && (task.assigneeId || 'unassigned') !== assignee) return false;
      if (term && !task.title.toLowerCase().includes(term)) return false;
      if (filter === 'done') return Boolean(task.completedAt);
      if (task.completedAt) return false;
      if (filter === 'mine') return task.assigneeId === memberId;
      if (filter === 'available') return !task.assigneeId;
      if (filter === 'due') return needsReminder(task, today);
      if (filter === 'recurring') return task.repeatDays > 0;
      return true;
    })
    .sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999'));
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pagination.filter === filter ? pagination.page : 1, totalPages);
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="panel task-panel">
      <div className="panel-heading">
        <div>
          <h2>{t('Družinska opravila')}</h2>
          <p>{t('Dogovorite se, kdo kaj prevzame.')}</p>
        </div>
        <ListTodo aria-hidden="true" size={22} />
      </div>
      <div className="filters" aria-label={t('Filtri opravil')}>
        {Object.entries(filters).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            onClick={() => {
              setPagination({ filter: key, page: 1 });
              onFilter(key);
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="task-refinements">
        <label>
          {t('Išči po naslovu')}
          <input
            type="search"
            value={search}
            placeholder={t('Npr. nakup')}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination({ filter, page: 1 });
            }}
          />
        </label>
        <label>
          {t('Kategorija')}
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPagination({ filter, page: 1 });
            }}
          >
            <option value="">{t('Vse kategorije')}</option>
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Član')}
          <select
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value);
              setPagination({ filter, page: 1 });
            }}
          >
            <option value="">{t('Vsi člani')}</option>
            <option value="unassigned">{t('Nedodeljeno')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length ? (
        <ul className="task-list">
          {shown.map((task) => {
            const due = task.dueOn && shortDate.format(fromKey(task.dueOn));
            const overdue = !task.completedAt && task.dueOn && task.dueOn < today;
            return (
              <li key={task.id} className="task-row">
                <span className={`task-icon ${task.completedAt ? 'done' : ''}`}>
                  {task.completedAt ? <Check size={18} /> : <ListTodo size={18} />}
                </span>
                <div className="task-info">
                  <strong>{task.title}</strong>
                  <p>
                    {names.get(task.assigneeId) || t('Na voljo za prevzem')}
                    {due && (
                      <span className={needsReminder(task, today) ? 'overdue' : ''}>
                        {' '}
                        · {overdue ? t('V zamudi, ') : ''}
                        {due}
                      </span>
                    )}
                    {task.repeatDays > 0 && (
                      <span>
                        {t(' · Vsakih %0 dni', task.repeatDays)}
                        {task.rotate ? t(' · Rotacija') : ''}
                      </span>
                    )}
                  </p>
                </div>
                <span className="tag">{t(categories[task.category])}</span>
                <div className="row-actions">
                  <button className="soft-button" onClick={() => onDetails(task)}>
                    {t('Podrobnosti')}
                  </button>
                  {!task.completedAt && onEdit && (
                    <button
                      className="icon-button"
                      aria-label={t('Uredi %0', task.title)}
                      onClick={() => onEdit(task)}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {!task.completedAt && !task.assigneeId && (
                    <button
                      className="soft-button"
                      disabled={busy}
                      onClick={() => onAction(task.id, 'claim')}
                    >
                      {t('Prevzemi')}
                    </button>
                  )}
                  {!task.completedAt && task.assigneeId === memberId && (
                    <>
                      <button
                        className="soft-button"
                        disabled={busy}
                        onClick={() => onAction(task.id, 'cover')}
                      >
                        {t('Prosi za zamenjavo')}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t('Zaključi %0', task.title)}
                        title={t('Zaključi')}
                        disabled={busy}
                        onClick={() => onAction(task.id, 'complete')}
                      >
                        <Check size={19} />
                      </button>
                    </>
                  )}
                </div>
                {task.voice && (
                  <audio
                    className="task-audio"
                    controls
                    preload="none"
                    src={voiceUrl(task.id)}
                    aria-label={t('Glasovna beležka: %0', task.title)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <span className="empty-icon">{filter === 'done' ? <CircleCheckBig /> : <ListTodo />}</span>
          <strong>{tasks.length ? t('V tem pogledu ni opravil') : t('Začnite s prvim opravilom')}</strong>
          <p>
            {tasks.length
              ? t('Izberi drug filter za več opravil.')
              : t('Dodaj nekaj, kar bi radi uredili skupaj.')}
          </p>
          {!tasks.length && onAdd && (
            <button className="soft-button" onClick={onAdd}>
              <Plus size={17} /> {t('Dodaj opravilo')}
            </button>
          )}
        </div>
      )}
      {totalPages > 1 && (
        <nav className="task-pagination" aria-label={t('Strani opravil')}>
          <button
            className="icon-button"
            disabled={page === 1}
            aria-label={t('Prejšnja stran opravil')}
            onClick={() => setPagination({ filter, page: page - 1 })}
          >
            <ChevronLeft size={17} />
          </button>
          <span aria-live="polite">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} {t('od')}{' '}
            {filtered.length}
          </span>
          <button
            className="icon-button"
            disabled={page === totalPages}
            aria-label={t('Naslednja stran opravil')}
            onClick={() => setPagination({ filter, page: page + 1 })}
          >
            <ChevronRight size={17} />
          </button>
        </nav>
      )}
    </section>
  );
}

export function Calendar({ entries, today, compact, onOpen, onAdd, onEdit }) {
  const [offset, setOffset] = useState(0);
  const now = fromKey(today);
  const monday = addDays(now, -((now.getDay() + 6) % 7) + offset * 7);
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const firstDate = dateKey(monday);
  const lastDate = dateKey(sunday);
  const week = entries.filter(
    (entry) =>
      entry.dueOn && ((entry.dueOn >= firstDate && entry.dueOn <= lastDate) || eventBlock(entry, firstDate)),
  );
  const rangeStart =
    shortDate.format(monday) +
    (monday.getFullYear() !== sunday.getFullYear() ? ` ${monday.getFullYear()}` : '');
  return (
    <section className={`panel calendar ${compact ? 'compact' : ''}`}>
      <div className="panel-heading">
        <div>
          <h2>{compact ? t('Ta teden') : t('Tedenski koledar')}</h2>
          <p>
            {rangeStart} – {shortDate.format(sunday)} {sunday.getFullYear()}
          </p>
        </div>
        {compact ? (
          <CalendarDays size={22} aria-hidden="true" />
        ) : (
          <div className="week-controls">
            <button
              className="icon-button"
              aria-label={t('Prejšnji teden')}
              onClick={() => setOffset(offset - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button className="soft-button" onClick={() => setOffset(0)}>
              {t('Danes')}
            </button>
            <button
              className="icon-button"
              aria-label={t('Naslednji teden')}
              onClick={() => setOffset(offset + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      <ol className="week">
        {days.map((day) => {
          const key = dateKey(day);
          const items = week
            .map((entry) => ({ entry, block: eventBlock(entry, key) }))
            .filter(({ entry, block }) => entry.dueOn === key || block)
            .sort((a, b) => (a.block?.start ?? -1) - (b.block?.start ?? -1));
          return (
            <li key={key} className={key === today ? 'today' : ''}>
              <span>{weekday.format(day)}</span>
              <strong>{day.getDate()}</strong>
              {compact ? (
                <span className={items.length ? 'day-dot' : 'day-dot empty-dot'} />
              ) : (
                <ul className="day-entries">
                  {items.map(({ entry, block }) => (
                    <li key={entry.id} className={entry.kind + (block ? ' timed-event' : '')}>
                      <span>
                        {block
                          ? clockTime(block.start) + (block.end === null ? '' : ' – ' + clockTime(block.end))
                          : entry.kind === 'event'
                            ? t('Ves dan')
                            : entry.completedAt
                              ? t('Zaključeno')
                              : t('Opravilo')}
                      </span>
                      {entry.completedAt || !onEdit ? (
                        entry.title
                      ) : (
                        <button
                          className="calendar-edit"
                          onClick={() => onEdit(entry)}
                          aria-label={t('Uredi %0', entry.title)}
                        >
                          {entry.title}
                        </button>
                      )}
                      {entry.voice &&
                        (window.sotovorDesktop ? (
                          <audio
                            className="voice-link desktop-audio"
                            controls
                            preload="none"
                            src={voiceUrl(entry.id)}
                            aria-label={t('Glasovna beležka: %0', entry.title)}
                          />
                        ) : (
                          <a
                            className="voice-link"
                            href={voiceUrl(entry.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('Poslušaj')}
                          </a>
                        ))}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {compact && (
        <>
          <p className="calendar-caption">
            {week.length ? t('Vnosov ta teden: %0', week.length) : t('Ta teden še ni vnosov.')}
          </p>
          <button className="text-button" onClick={onOpen}>
            {t('Odpri koledar')} <ArrowRight size={16} />
          </button>
        </>
      )}
      {!compact && onAdd && (
        <button className="text-button" onClick={onAdd}>
          <Plus size={17} /> {t('Dodaj dogodek')}
        </button>
      )}
    </section>
  );
}

export function Workload({ members, tasks, memberId, compact, onOpen }) {
  const [days, setDays] = useState('30');
  const since = days === 'all' || compact ? 0 : +addDays(new Date(), -Number(days));
  const rows = members.map((member, index) => {
    const assigned = tasks.filter((task) => task.assigneeId === member.id);
    const done = assigned.filter((task) => task.completedAt && Date.parse(task.completedAt) >= since).length;
    return { ...member, index, done, open: assigned.filter((task) => !task.completedAt).length };
  });
  const max = Math.max(1, ...rows.map((row) => row.open + row.done));
  return (
    <section className="panel workload">
      <div className="panel-heading">
        <div>
          <h2>{t('Razporeditev dela')}</h2>
          <p>{t('Opravila po družinskih članih')}</p>
        </div>
        <UsersRound size={22} aria-hidden="true" />
      </div>
      {!compact && (
        <label className="workload-filter">
          {t('Obdobje za zaključena opravila')}
          <select value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="7">{t('Zadnjih 7 dni')}</option>
            <option value="30">{t('Zadnjih 30 dni')}</option>
            <option value="all">{t('Vse od začetka')}</option>
          </select>
        </label>
      )}
      <ul className="load-list">
        {rows.map((row) => (
          <li key={row.id}>
            <Avatar name={row.name} index={row.index} />
            <div>
              <strong>
                {row.name}
                {row.id === memberId && <span> {t('· ti')}</span>}
              </strong>
              <div className="load-bar" aria-hidden="true">
                <span style={{ width: `${(row.done / max) * 100}%` }} />
                <span style={{ width: `${(row.open / max) * 100}%` }} />
              </div>
              <p>{t('%0 odprtih · %1 zaključenih', row.open, row.done)}</p>
            </div>
          </li>
        ))}
      </ul>
      {!compact && (
        <p className="muted workload-unassigned">
          {t('Brez odgovornega člana:')}{' '}
          {tasks.filter((task) => !task.assigneeId && !task.completedAt).length}
        </p>
      )}
      {compact && (
        <button className="text-button" onClick={onOpen}>
          {t('Poglej razporeditev')} <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}
