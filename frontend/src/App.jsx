import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, Check, Clipboard, House, LayoutGrid,
  ListTodo, Plus, UserRoundPlus, UsersRound, X,
} from 'lucide-react';
import { Avatar, Calendar, Metrics, Tasks, Workload } from './Overview.jsx';
import { categories, dateKey, fullDate, request } from './data.js';

const pages = {
  overview: ['Pregled', LayoutGrid],
  tasks: ['Opravila', ListTodo],
  calendar: ['Koledar', CalendarDays],
  workload: ['Razporeditev', UsersRound],
};

function Brand() {
  return <span className="brand"><span className="brand-icon"><House size={21} strokeWidth={2.3} /></span>Sotovor<span className="brand-dot">.</span></span>;
}

function Welcome({ onSubmit, busy, error }) {
  const [joining, setJoining] = useState(false);
  return <main className="welcome">
    <div className="welcome-copy">
      <Brand />
      <div className="welcome-text">
        <h1>Manj skrbi.<br /><em>Več skupaj.</em></h1>
        <p>En prostor za družinska opravila, dogovore in pregled nad tem, kdo kaj prevzame.</p>
        <ul>
          <li><span><ListTodo size={19} /></span> Opravila, ki jih lahko prevzame vsak član</li>
          <li><span><CalendarDays size={19} /></span> Skupni tedenski koledar</li>
          <li><span><UsersRound size={19} /></span> Razporeditev dela po članih</li>
        </ul>
      </div>
    </div>
    <section className="welcome-right">
      <div className="panel welcome-form">
        <h2>{joining ? 'Pridruži se prostoru' : 'Ustvari družinski prostor'}</h2>
        <p>{joining ? 'Uporabi kodo, ki ti jo je poslal družinski član.' : 'Vnesi ime prostora in dodaj sebe kot prvega člana.'}</p>
        <form key={joining} onSubmit={event => {
          event.preventDefault();
          onSubmit(joining, Object.fromEntries(new FormData(event.currentTarget)));
        }}>
          {joining
            ? <label>Koda povabila<input name="inviteCode" maxLength="32" required autoCapitalize="none" spellCheck={false} placeholder="Koda iz povabila" /></label>
            : <label>Ime prostora<input name="householdName" maxLength="80" required placeholder="Npr. Naš dom" /></label>}
          <label>Tvoje ime<input name="memberName" maxLength="60" required autoComplete="given-name" placeholder="Npr. Ana" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{joining ? 'Pridruži se' : 'Ustvari prostor'} <ArrowRight size={18} /></button>
        </form>
        <button className="text-button" onClick={() => setJoining(!joining)}>{joining ? 'Ustvari svoj prostor' : 'Že imaš povabilo?'} <ArrowRight size={16} /></button>
      </div>
    </section>
  </main>;
}

function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault();
    onClose();
  }}>
    <div className="panel-heading"><h2 id="dialog-title">{title}</h2>
      <button className="icon-button" onClick={onClose} aria-label="Zapri"><X size={19} /></button>
    </div>
    {children}
  </dialog>;
}

function EntryDialog({ initialKind, members, busy, error, onSave, onClose }) {
  const [kind, setKind] = useState(initialKind);
  return <Dialog title="Nov vnos" onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      onSave({ ...values, dueOn: values.dueOn || null, assigneeId: values.assigneeId || null });
    }}>
      <label>Vrsta<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="task">Opravilo</option><option value="event">Dogodek</option>
      </select></label>
      <label>Naslov<input name="title" maxLength="160" required placeholder={kind === 'task' ? 'Npr. Prevzem iz šole' : 'Npr. Družinsko kosilo'} /></label>
      <div className="fields">
        <label>{kind === 'event' ? 'Datum' : 'Rok (neobvezno)'}<input type="date" name="dueOn" required={kind === 'event'} /></label>
        <label>Kategorija<select name="category" defaultValue="drugo">
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      {kind === 'task' && <label>Dodeli članu<select name="assigneeId">
        <option value="">Na voljo za prevzem</option>
        {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}><Plus size={19} />{kind === 'task' ? 'Dodaj opravilo' : 'Dodaj dogodek'}</button>
    </form>
  </Dialog>;
}

function InviteDialog({ code, onClose }) {
  const [copied, setCopied] = useState(false);
  const input = useRef(null);
  return <Dialog title="Povabi družinskega člana" onClose={onClose}>
    <p className="muted">Pošlji mu naslov Sotovora in kodo. Na začetni strani naj izbere možnost »Že imaš povabilo?«.</p>
    <label className="invite-label">Koda povabila<input ref={input} readOnly value={code} /></label>
    <button className="primary" onClick={async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
      } catch {
        input.current.focus();
        input.current.select();
      }
    }}>{copied ? <Check size={18} /> : <Clipboard size={18} />} {copied ? 'Koda je kopirana' : 'Kopiraj kodo'}</button>
  </Dialog>;
}

export default function App() {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [today, setToday] = useState(() => dateKey(new Date()));
  const pending = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh(initial = false) {
      if (pending.current || (!initial && document.hidden)) return;
      const startedAt = revision.current;
      try {
        const next = await request('/dashboard', undefined, controller.signal);
        if (!active || pending.current || revision.current !== startedAt) return;
        setData(next);
      } catch (error) {
        if (active && initial) setError(error.message);
      }
    }
    void refresh(true);
    const timer = setInterval(() => {
      setToday(dateKey(new Date()));
      void refresh();
    }, 8000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);

  async function run(work) {
    if (pending.current) return;
    pending.current = true;
    revision.current++;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await work();
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function go(nextPage, nextFilter = 'all') {
    setPage(nextPage);
    setFilter(nextFilter);
    setError('');
    setNotice('');
    window.scrollTo(0, 0);
  }

  function open(kind) {
    setError('');
    setModal(kind);
  }

  if (data === undefined) return <main className="loading">
    <Brand />
    {error ? <><p role="alert">{error}</p><button className="primary" onClick={() => location.reload()}>Poskusi znova</button></> : <p role="status">Odpiram družinski prostor …</p>}
  </main>;
  if (!data) return <Welcome busy={busy} error={error} onSubmit={(joining, fields) => run(async () => {
    await request(joining ? '/households/join' : '/households', fields);
    setData(await request('/dashboard'));
  })} />;

  const { household, memberId, members, entries } = data;
  const member = members.find(member => member.id === memberId);
  const tasks = entries.filter(entry => entry.kind === 'task');
  const overview = page === 'overview';
  const taskPanel = <Tasks {...{ tasks, members, memberId, today, filter, busy }} onFilter={setFilter}
    onAdd={() => open('task')} onAction={(id, action) => run(async () => {
      setData(await request(`/tasks/${id}/${action}`, {}));
      setNotice({ claim: 'Opravilo je prevzeto.', cover: 'Opravilo je spet na voljo za prevzem.', complete: 'Opravilo je zaključeno.' }[action]);
    })} />;

  return <div className="workspace">
    <aside className="sidebar">
      <button className="brand-button" onClick={() => go('overview')} aria-label="Sotovor, pregled"><Brand /></button>
      <div className="household"><span><House size={17} /></span><div><strong>{household.name}</strong><small>Družinski prostor</small></div></div>
      <nav aria-label="Glavna navigacija">{Object.entries(pages).map(([key, [label, Icon]]) =>
        <button key={key} aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}><Icon size={19} /> {label}</button>)}</nav>
      <div className="sidebar-profile"><Avatar name={member.name} /><strong>{member.name}</strong></div>
    </aside>
    <main className="main">
      <header className="topbar"><span><House size={16} />{household.name}</span>
        <button className="soft-button" onClick={() => open('invite')}><UserRoundPlus size={17} /> Povabi člana</button>
      </header>
      <div className="content">
        <div className="page-heading">
          <div><p className="today-label"><CalendarDays size={16} /> {fullDate.format(new Date(today + 'T12:00:00'))}</p>
            <h1>{overview ? `Živjo, ${member.name}!` : pages[page][0]}</h1>
            {overview && <p>Tukaj je pregled vaših družinskih opravil in dogovorov.</p>}
          </div>
          <button className="primary" onClick={() => open(page === 'calendar' ? 'event' : 'task')}><Plus size={20} /> Dodaj vnos</button>
        </div>
        {error && !modal && <p className="error banner" role="alert">{error}</p>}
        {notice && <p className="notice banner" role="status">{notice}</p>}
        {overview && <>
          <Metrics {...{ tasks, memberId, today }} onFilter={next => go('tasks', next)} />
          <div className="overview-grid">{taskPanel}<div className="right-stack">
            <Calendar {...{ entries, today }} compact onOpen={() => go('calendar')} />
            <Workload {...{ members, tasks, memberId }} compact onOpen={() => go('workload')} />
          </div></div>
        </>}
        {page === 'tasks' && taskPanel}
        {page === 'calendar' && <Calendar {...{ entries, today }} onAdd={() => open('event')} />}
        {page === 'workload' && <Workload {...{ members, tasks, memberId }} />}
      </div>
    </main>
    {modal === 'invite' && <InviteDialog code={household.inviteCode} onClose={() => setModal(null)} />}
    {(modal === 'task' || modal === 'event') && <EntryDialog initialKind={modal} {...{ members, busy, error }}
      onClose={() => { if (!pending.current) setModal(null); }}
      onSave={fields => run(async () => {
        setData(await request('/entries', fields));
        setModal(null);
        setNotice(fields.kind === 'event' ? 'Dogodek je dodan.' : 'Opravilo je dodano.');
      })} />}
  </div>;
}
