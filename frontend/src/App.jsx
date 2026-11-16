import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays, Check, Clipboard, House, LayoutGrid,
  ListTodo, LogOut, Plus, UserRound, UserRoundPlus, UsersRound, X,
} from 'lucide-react';
import { Avatar, Calendar, Metrics, Tasks, Workload } from './Overview.jsx';
import Notifications from './Notifications.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';
import { Brand, ChooseHousehold } from './Account.jsx';
import Landing from './Landing.jsx';
import './landing.css';
import FamilySettings from './FamilySettings.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import { DesktopApproval, DesktopSignIn, desktopBridge, desktopLink } from './DesktopAccess.jsx';
import { categories, dateKey, fullDate, request, selectHousehold } from './data.js';

const pages = {
  overview: ['Pregled', LayoutGrid],
  tasks: ['Opravila', ListTodo],
  calendar: ['Koledar', CalendarDays],
  workload: ['Razporeditev', UsersRound],
  profile: ['Profil', UserRound],
};

function updateWorkspace(data, setData) {
  selectHousehold(data?.profile ? data.household?.id : undefined);
  setData(data);
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

function EntryDialog({ initialKind, initialDate, entry, permissions, members, busy, error, onSave, onRemove, onClose }) {
  const [kind, setKind] = useState(initialKind);
  const [repeatDays, setRepeatDays] = useState(String(entry?.repeatDays ?? 0));
  const [removing, setRemoving] = useState(false);
  const [voice, setVoice] = useState(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const editContent = !entry || permissions.edit;
  const moveDate = !entry || permissions.move;
  return <Dialog title={entry ? 'Uredi vnos' : 'Nov vnos'} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      if (recordingBusy) return;
      const values = Object.fromEntries(new FormData(event.currentTarget));
      onSave({
        kind, dueOn: moveDate ? values.dueOn || null : entry.dueOn,
        title: editContent ? values.title : entry.title, category: editContent ? values.category : entry.category,
        assigneeId: editContent ? values.assigneeId || null : entry.assigneeId,
        repeatDays: editContent ? Number(values.repeatDays || 0) : entry.repeatDays ?? 0,
        rotate: editContent ? values.rotate === 'on' : entry.rotate ?? false,
        reminderDays: editContent ? Number(values.reminderDays ?? 2) : entry.reminderDays ?? 2, voice,
      });
    }}>
      {!entry && <label>Vrsta<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="task">Opravilo</option><option value="event">Dogodek</option>
      </select></label>}
      <label>Naslov<input name="title" readOnly={!editContent} defaultValue={entry?.title} maxLength="160" required placeholder={kind === 'task' ? 'Npr. Prevzem iz šole' : 'Npr. Družinsko kosilo'} /></label>
      <div className="fields">
        <label>{kind === 'event' ? 'Datum' : 'Rok'}<input type="date" name="dueOn" readOnly={!moveDate} defaultValue={entry?.dueOn ?? initialDate} required={kind === 'event' || Number(repeatDays) > 0} /></label>
        <label>Kategorija<select name="category" disabled={!editContent} defaultValue={entry?.category ?? 'drugo'}>
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      {kind === 'task' && <label>Dodeli članu<select name="assigneeId" disabled={!editContent} defaultValue={entry?.assigneeId ?? ''}>
        <option value="">Na voljo za prevzem</option>
        {members.filter(member => !member.inactive).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>}
      {kind === 'task' && editContent && <div className="fields">
        <label>Ponovi čez dni<input name="repeatDays" type="number" min="0" max="3660" required value={repeatDays} onChange={event => setRepeatDays(event.target.value)} /></label>
        <label>Opomni dni pred rokom<input name="reminderDays" type="number" min="0" max="30" defaultValue={entry?.reminderDays ?? 2} required /></label>
      </div>}
      {kind === 'task' && editContent && Number(repeatDays) > 0 && <label className="check-field"><input name="rotate" type="checkbox" defaultChecked={entry?.rotate} /> Naslednjič dodeli naslednjemu članu</label>}
      {!entry && <VoiceRecorder onChange={setVoice} busy={busy || recordingBusy} setBusy={setRecordingBusy} />}
      {error && <p className="error" role="alert">{error}</p>}
      {(editContent || moveDate) && <button className="primary" disabled={busy || recordingBusy || removing}>{entry ? 'Shrani spremembe' : <><Plus size={19} />{kind === 'task' ? 'Dodaj opravilo' : 'Dodaj dogodek'}</>}</button>}
      {entry && permissions.remove && (removing ? <div className="top-actions">
        <button type="button" className="soft-button" onClick={() => setRemoving(false)} disabled={busy}>Obdrži vnos</button>
        <button type="button" className="danger-button soft-button" onClick={onRemove} disabled={busy}>Potrdi odstranitev</button>
      </div> : <button type="button" className="danger-button text-button" onClick={() => setRemoving(true)} disabled={busy}>Odstrani vnos</button>)}
    </form>
  </Dialog>;
}

function InviteDialog({ code, onClose, onRotate, busy, error }) {
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
    <button className="text-button rotate-code" disabled={busy} onClick={() => { setCopied(false); onRotate(); }}>Ustvari novo kodo</button>
    {error && <p className="error" role="alert">{error}</p>}
  </Dialog>;
}

function WhatsAppDialog({ linked, onClose, onUpdate }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function change(action) {
    setBusy(true);
    setError('');
    try {
      const result = await request('/whatsapp/' + action, {});
      setCode(result.code || '');
      await onUpdate();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title="Vnos prek WhatsAppa" onClose={onClose}>
    <p>{linked ? 'Povezana številka lahko pošlje naslov opravila ali sporočilo »dogodek LLLL-MM-DD Naslov«.' :
      'Ustvari kodo in jo z izbrane številke pošlji na poslovno številko Sotovora.'}</p>
    {code && <label className="invite-label">Sporočilo za povezavo (velja 10 minut)<input readOnly value={'poveži ' + code} onFocus={event => event.target.select()} /></label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="top-actions">
      <button className="primary" disabled={busy} onClick={() => change('pair')}>Ustvari kodo</button>
      {linked && <button className="soft-button" disabled={busy} onClick={() => change('unlink')}>Prekini povezavo</button>}
    </div>
  </Dialog>;
}

export default function App() {
  const [inApp, setInApp] = useState(Boolean(desktopBridge));
  const [data, setData] = useState(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(desktopBridge ? 'overview' : 'profile');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [calendarView, setCalendarView] = useState('month');
  const [entryDate, setEntryDate] = useState('');
  const [today, setToday] = useState(() => dateKey(new Date()));
  const pending = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const controller = new AbortController();
    async function refresh(initial = false) {
      if (refreshing || pending.current || (!initial && document.hidden)) return;
      refreshing = true;
      const startedAt = revision.current;
      try {
        const next = await request('/dashboard', undefined, controller.signal).catch(error => {
          if (error.status !== 403) throw error;
          return request('/dashboard', undefined, controller.signal, null);
        });
        if (!active || pending.current || revision.current !== startedAt) return;
        updateWorkspace(next, setData);
      } catch (error) {
        if (active && initial) setError(error.message);
      } finally {
        refreshing = false;
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

  function open(kind, date = '') {
    setError('');
    setEntryDate(date);
    setModal(kind);
  }

  function edit(entry) {
    setEditing(entry);
    open('edit');
  }

  if (data === undefined) return <main className="loading">
    <Brand />
    {error ? <><p role="alert">{error}</p><button className="primary" onClick={() => location.reload()}>Poskusi znova</button></> : <p role="status">Odpiram družinski prostor …</p>}
  </main>;
  function logout() {
    return run(async () => {
      await request('/auth/logout', {}, undefined, null);
      updateWorkspace(null, setData);
      setInApp(Boolean(desktopBridge));
      setPage('profile');
      setModal(null);
    });
  }

  const legacy = Boolean(data?.household && !data.profile);
  const onAuth = (mode, fields) => run(async () => {
    await request('/auth/' + mode, fields, undefined, null);
    updateWorkspace(await request('/dashboard', undefined, undefined, null), setData);
    go('profile');
    setInApp(true);
  });
  if (desktopLink && !desktopBridge) return <DesktopApproval profile={data?.profile} {...{ legacy, busy, error, onAuth }} onLogout={logout} />;
  if (desktopBridge && !data?.profile) return <DesktopSignIn />;
  if (!inApp || !data?.profile) return <Landing signedIn={Boolean(data?.profile)} {...{ legacy, busy, error, onAuth }}
    onEnter={() => { go('profile'); setInApp(true); }} />;

  if (!data.household) return <ChooseHousehold profile={data.profile} busy={busy} error={error} onLogout={logout} onSubmit={(joining, fields) => run(async () => {
    const { householdId } = await request(joining ? '/households/join' : '/households', fields);
    updateWorkspace(await request('/dashboard', undefined, undefined, householdId), setData);
    setPage('overview');
  })} />;

  const { household, memberId, members, entries, permissions } = data;
  const member = members.find(member => member.id === memberId);
  const tasks = entries.filter(entry => entry.kind === 'task');
  const overview = page === 'overview';
  const canManage = permissions.edit || permissions.move || permissions.remove;
  const taskPanel = <Tasks {...{ tasks, members, memberId, today, filter, busy }} onFilter={setFilter} onEdit={canManage ? edit : undefined}
    onAdd={permissions.create ? () => open('task') : undefined} onAction={(id, action) => run(async () => {
      setData(await request(`/tasks/${id}/${action}`, {}));
      setNotice({ claim: 'Opravilo je prevzeto.', cover: 'Opravilo je spet na voljo za prevzem.', complete: 'Opravilo je zaključeno.' }[action]);
    })} />;

  return <div className={`workspace${desktopBridge ? ' desktop-workspace' : ''}`}>
    <aside className="sidebar">
      <button className="brand-button" onClick={() => go('overview')} aria-label="Sotovor, pregled"><Brand /></button>
      <div className="household"><span><House size={17} /></span><div><strong>{household.name}</strong><small>Družinski prostor</small></div></div>
      <nav aria-label="Glavna navigacija">{Object.entries(pages).map(([key, [label, Icon]]) =>
        <button key={key} aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}><Icon size={19} /> {label}</button>)}</nav>
      <div className="sidebar-profile"><Avatar name={member.name} /><strong>{member.name}</strong></div>
    </aside>
    <main className="main">
      <header className="topbar"><span><House size={16} />{household.name}</span>
        <div className="top-actions">
          <Notifications key={memberId} {...{ tasks, memberId, today }} onView={next => go('tasks', next)} />
          {data.admin && data.whatsapp?.enabled && <button className="soft-button" onClick={() => open('whatsapp')}>WhatsApp</button>}
          {data.admin && <button className="soft-button" onClick={() => open('invite')}><UserRoundPlus size={17} /> Povabi člana</button>}
          <button className="soft-button" type="button" onClick={logout} disabled={busy}><LogOut size={17} /> Odjava</button>
        </div>
      </header>
      <div className="content" key={page + ':' + household.id}>
        <div className="page-heading">
          <div><p className="today-label"><CalendarDays size={16} /> {fullDate.format(new Date(today + 'T12:00:00'))}</p>
            <h1>{overview ? `Živjo, ${member.name}!` : pages[page][0]}</h1>
            {overview && <p>Tukaj je pregled vaših družinskih opravil in dogovorov.</p>}
          </div>
          {page !== 'profile' && permissions.create && <button className="primary" onClick={() => open(page === 'calendar' ? 'event' : 'task')}><Plus size={20} /> Dodaj vnos</button>}
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
        {page === 'calendar' && <>
          <div className="calendar-view" aria-label="Pogled koledarja">
            <button className="soft-button" aria-pressed={calendarView === 'month'} onClick={() => setCalendarView('month')}>Mesec</button>
            <button className="soft-button" aria-pressed={calendarView === 'week'} onClick={() => setCalendarView('week')}>Teden</button>
          </div>
          {calendarView === 'month' ? <MonthCalendar {...{ entries, members, today }}
            onAdd={permissions.create ? date => open('event', date) : undefined} onEdit={canManage ? edit : undefined} /> :
            <Calendar {...{ entries, today }} onAdd={permissions.create ? () => open('event') : undefined} onEdit={canManage ? edit : undefined} />}
        </>}
        {page === 'workload' && <Workload {...{ members, tasks, memberId }} />}
        {page === 'profile' && <div className="profile-grid"><section className="panel account-card">
          <h2>{data.profile.firstName} {data.profile.lastName}</h2>
          <p>{data.profile.email}<br />{data.profile.phone}</p>
          <p><strong>{household.name}</strong> · {data.admin ? 'Skrbnik' : 'Član'}</p>
          {data.spaces?.length > 1 && <label className="family-switch">Družinski prostor
            <select value={household.id} disabled={busy} onChange={event => {
              const id = event.target.value;
              run(async () => {
                updateWorkspace(await request('/dashboard', undefined, undefined, id), setData);
                setFilter('all');
              });
            }}>
              {data.spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>}
          <div className="hero-actions">
            <button className="primary" onClick={() => go('overview')}>Odpri nadzorno ploščo</button>
            {data.admin && <button className="soft-button" onClick={() => open('family')} disabled={busy}><Plus size={17} /> Nova družina</button>}
          </div>
          {!data.admin && (data.leaveRequested ? <p>Prošnja za izstop čaka na skrbnika.</p> :
            <button className="text-button" onClick={() => run(async () => {
              await request('/households/leave', {});
              setData(await request('/dashboard'));
            })} disabled={busy}>Zaprosi za izstop iz prostora</button>)}
        </section>
          {data.admin && <FamilySettings members={members} expectedMembers={household.expectedMembers} busy={busy} onInvite={() => open('invite')}
            onChange={(id, action, fields = {}) => run(async () => {
              await request(`/households/members/${id}/${action}`, fields);
              setData(await request('/dashboard'));
              setNotice('Sprememba je shranjena.');
            })} />}
        </div>}
      </div>
    </main>
    {modal === 'invite' && data.admin && <InviteDialog code={household.inviteCode} {...{ busy, error }}
      onClose={() => { setModal(null); setError(''); }}
      onRotate={() => run(async () => {
        await request('/households/invite/rotate', {});
        setData(await request('/dashboard'));
      })} />}
    {modal === 'family' && data.admin && <Dialog title="Ustvari novo družino" onClose={() => { if (!busy) setModal(null); }}>
      <form onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        run(async () => {
          const { householdId } = await request('/households', {
            householdName: fields.get('householdName'), expectedMembers: Number(fields.get('expectedMembers')),
          });
          updateWorkspace(await request('/dashboard', undefined, undefined, householdId), setData);
          setFilter('all');
          setModal('invite');
        });
      }}>
        <label>Ime družine<input name="householdName" required maxLength={80} /></label>
        <label>Načrtovano število članov<input name="expectedMembers" type="number" min={1} max={100} defaultValue={4} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>Ustvari družinski prostor</button>
      </form>
    </Dialog>}
    {modal === 'whatsapp' && <WhatsAppDialog linked={data.whatsapp.linked} onClose={() => setModal(null)}
      onUpdate={async () => setData(await request('/dashboard'))} />}
    {['task', 'event', 'edit'].includes(modal) && <EntryDialog initialKind={modal === 'edit' ? editing.kind : modal} initialDate={entryDate}
      entry={modal === 'edit' ? editing : null} {...{ permissions, members, busy, error }}
      onClose={() => { if (!pending.current) { setModal(null); setError(''); } }}
      onRemove={() => run(async () => {
        setData(await request(`/entries/${editing.id}/remove`, { version: editing.version ?? 0 }));
        setModal(null);
        setNotice('Vnos je odstranjen.');
      })}
      onSave={fields => run(async () => {
        setData(await request(modal === 'edit' ? `/entries/${editing.id}/edit` : '/entries',
          modal === 'edit' ? { ...fields, version: editing.version ?? 0 } : fields));
        setModal(null);
        setNotice(modal === 'edit' ? 'Spremembe so shranjene.' : fields.kind === 'event' ? 'Dogodek je dodan.' : 'Opravilo je dodano.');
      })} />}
  </div>;
}
