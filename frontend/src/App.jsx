import { t, errorText, getLanguage, subscribe } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { EmailVerificationReminder } from './EmailVerification.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import SmartPlanning from './SmartPlanning.jsx';
import { DesktopApproval, DesktopSignIn, desktopBridge, desktopLink } from './DesktopAccess.jsx';
import { categories, dateKey, fullDate, request, selectHousehold } from './data.js';

const pages = {
  overview: ['Pregled', LayoutGrid],
  tasks: ['Opravila', ListTodo],
  calendar: ['Koledar', CalendarDays],
  workload: ['Razporeditev', UsersRound],
  profile: ['Profil', UserRound],
};
const inviteFromUrl = new URLSearchParams(window.location.search).get('invite')?.trim().toLowerCase();
const initialInvite = /^[a-f0-9]{32}$/.test(inviteFromUrl ?? '') ? inviteFromUrl : '';

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
      <button className="icon-button" onClick={onClose} aria-label={t('Zapri')}><X size={19} /></button>
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
  return <Dialog title={entry ? t('Uredi vnos') : t('Nov vnos')} onClose={onClose}>
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
      {!entry && <label>{t('Vrsta')}<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="task">{t('Opravilo')}</option><option value="event">{t('Dogodek')}</option>
      </select></label>}
      <label>{t('Naslov')}<input name="title" readOnly={!editContent} defaultValue={entry?.title} maxLength="160" required placeholder={kind === 'task' ? t('Npr. Prevzem iz šole') : t('Npr. Družinsko kosilo')} /></label>
      <div className="fields">
        <label>{kind === 'event' ? t('Datum') : t('Rok')}<input type="date" name="dueOn" readOnly={!moveDate} defaultValue={entry?.dueOn ?? initialDate} required={kind === 'event' || Number(repeatDays) > 0} /></label>
        <label>{t('Kategorija')}<select name="category" disabled={!editContent} defaultValue={entry?.category ?? 'drugo'}>
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select></label>
      </div>
      {kind === 'task' && <label>{t('Dodeli članu')}<select name="assigneeId" disabled={!editContent} defaultValue={entry?.assigneeId ?? ''}>
        <option value="">{t('Na voljo za prevzem')}</option>
        {members.filter(member => !member.inactive).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select></label>}
      {kind === 'task' && editContent && <div className="fields">
        <label>{t('Ponovi čez dni')}<input name="repeatDays" type="number" min="0" max="3660" required value={repeatDays} onChange={event => setRepeatDays(event.target.value)} /></label>
        <label>{t('Opomni dni pred rokom')}<input name="reminderDays" type="number" min="0" max="30" defaultValue={entry?.reminderDays ?? 2} required /></label>
      </div>}
      {kind === 'task' && editContent && Number(repeatDays) > 0 && <label className="check-field"><input name="rotate" type="checkbox" defaultChecked={entry?.rotate} />{' '}{t('Naslednjič dodeli naslednjemu članu')}</label>}
      {!entry && <VoiceRecorder onChange={setVoice} busy={busy || recordingBusy} setBusy={setRecordingBusy} />}
      {error && <p className="error" role="alert">{errorText(error)}</p>}
      {(editContent || moveDate) && <button className="primary" disabled={busy || recordingBusy || removing}>{entry ? t('Shrani spremembe') : <><Plus size={19} />{kind === 'task' ? t('Dodaj opravilo') : t('Dodaj dogodek')}</>}</button>}
      {entry && permissions.remove && (removing ? <div className="top-actions">
        <button type="button" className="soft-button" onClick={() => setRemoving(false)} disabled={busy}>{t('Obdrži vnos')}</button>
        <button type="button" className="danger-button soft-button" onClick={onRemove} disabled={busy}>{t('Potrdi odstranitev')}</button>
      </div> : <button type="button" className="danger-button text-button" onClick={() => setRemoving(true)} disabled={busy}>{t('Odstrani vnos')}</button>)}
    </form>
  </Dialog>;
}

function InviteDialog({ code, onClose, onRotate, busy, error }) {
  const [copied, setCopied] = useState(false);
  const input = useRef(null);
  return <Dialog title={t('Povabi družinskega člana')} onClose={onClose}>
    <p className="muted">{t('Pošlji povezavo ali kodo. Član po prijavi izbere »Pridruži se s povabilom«.')}</p>
    <label className="invite-label">{t('Koda povabila')}<input ref={input} readOnly value={code} /></label>
    <button className="primary" onClick={async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
      } catch {
        input.current.focus();
        input.current.select();
      }
    }}>{copied ? <Check size={18} /> : <Clipboard size={18} />} {copied ? t('Koda je kopirana') : t('Kopiraj kodo')}</button>
    <label className="invite-label family-switch">{t('Povezava za povabilo')}<input readOnly
      value={`${window.location.origin}/?invite=${code}`} onFocus={event => event.target.select()} /></label>
    <button className="text-button rotate-code" disabled={busy} onClick={() => { setCopied(false); onRotate(); }}>{t('Ustvari novo kodo')}</button>
    {error && <p className="error" role="alert">{errorText(error)}</p>}
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

  return <Dialog title={t('Vnos prek WhatsAppa')} onClose={onClose}>
    <p>{linked ? t('Povezana številka lahko pošlje naslov opravila ali sporočilo »dogodek LLLL-MM-DD Naslov«.') :
      t('Ustvari kodo in jo z izbrane številke pošlji na poslovno številko Sotovora.')}</p>
    {code && <label className="invite-label">{t('Sporočilo za povezavo (velja 10 minut)')}<input readOnly value={'poveži ' + code} onFocus={event => event.target.select()} /></label>}
    {error && <p className="error" role="alert">{errorText(error)}</p>}
    <div className="top-actions">
      <button className="primary" disabled={busy} onClick={() => change('pair')}>{t('Ustvari kodo')}</button>
      {linked && <button className="soft-button" disabled={busy} onClick={() => change('unlink')}>{t('Prekini povezavo')}</button>}
    </div>
  </Dialog>;
}

export default function App() {
  useSyncExternalStore(subscribe, getLanguage);
  const [inApp, setInApp] = useState(Boolean(desktopBridge || initialInvite));
  const [data, setData] = useState(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(desktopBridge ? 'overview' : 'profile');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(initialInvite ? 'join' : null);
  const [inviteCode, setInviteCode] = useState(initialInvite);
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

  function followShortcut(destination) {
    if (destination === 'join') {
      go('profile');
      open('join');
    } else if (destination === 'voice') {
      go('tasks');
      if (data?.permissions?.create) open('task');
    } else {
      go(destination === 'reminders' || destination === 'recurring' ? 'tasks' : destination,
        destination === 'reminders' ? 'due' : destination === 'recurring' ? 'recurring' : 'all');
    }
    setInApp(true);
  }

  async function joinOrCreate(joining, fields) {
    const { householdId } = await request(joining ? '/households/join' : '/households', fields);
    updateWorkspace(await request('/dashboard', undefined, undefined, householdId), setData);
    if (joining && inviteCode) {
      setInviteCode('');
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url);
    }
    setModal(null);
    go('overview');
  }

  if (data === undefined) return <main className="loading">
    <Brand />
    <LanguageSelect />
    {error ? <><p role="alert">{errorText(error)}</p><button className="primary" onClick={() => location.reload()}>{t('Poskusi znova')}</button></> : <p role="status">{t('Odpiram družinski prostor …')}</p>}
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
    startWithInvite={Boolean(inviteCode)} onEnter={followShortcut} onJoin={() => open('join')} />;

  if (!data.household) return <ChooseHousehold profile={data.profile} {...{ busy, error, inviteCode }}
    verification={data.profile.emailVerificationPending && <EmailVerificationReminder />}
    startJoining={modal === 'join'} onLogout={logout} onSubmit={(joining, fields) => run(() => joinOrCreate(joining, fields))} />;

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
      <button className="brand-button" onClick={() => go('overview')} aria-label={t('Sotovor, pregled')}><Brand /></button>
      <div className="household"><span><House size={17} /></span><div><strong>{household.name}</strong><small>{t('Družinski prostor')}</small></div></div>
      <nav aria-label={t('Glavna navigacija')}>{Object.entries(pages).map(([key, [label, Icon]]) =>
        <button key={key} aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}><Icon size={19} /> {t(label)}</button>)}</nav>
      <div className="sidebar-profile"><Avatar name={member.name} /><strong>{member.name}</strong></div>
    </aside>
    <main className="main">
      <header className="topbar"><span><House size={16} />{household.name}</span>
        <div className="top-actions">
          <LanguageSelect />
          <Notifications key={memberId} tasks={tasks} householdId={household.id}
            onView={next => next === 'family' ? go('profile') : go('tasks', next)} />
          {data.admin && data.whatsapp?.enabled && <button className="soft-button" onClick={() => open('whatsapp')}>WhatsApp</button>}
          {data.admin && <button className="soft-button" onClick={() => open('invite')}><UserRoundPlus size={17} />{' '}{t('Povabi člana')}</button>}
          <button className="soft-button" type="button" onClick={logout} disabled={busy}><LogOut size={17} />{' '}{t('Odjava')}</button>
        </div>
      </header>
      <div className="content" key={page + ':' + household.id}>
        <div className="page-heading">
          <div><p className="today-label"><CalendarDays size={16} /> {fullDate.format(new Date(today + 'T12:00:00'))}</p>
            <h1>{overview ? t("Živjo, %0!", member.name) : t(pages[page][0])}</h1>
            {overview && <p>{t('Tukaj je pregled vaših družinskih opravil in dogovorov.')}</p>}
          </div>
          {page !== 'profile' && permissions.create && <button className="primary" onClick={() => open(page === 'calendar' ? 'event' : 'task')}><Plus size={20} />{' '}{t('Dodaj vnos')}</button>}
        </div>
        {error && !modal && <p className="error banner" role="alert">{errorText(error)}</p>}
        {notice && <p className="notice banner" role="status">{Array.isArray(notice) ? t(...notice) : t(notice)}</p>}
        {overview && <>
          <Metrics {...{ tasks, memberId, today }} onFilter={next => go('tasks', next)} />
          <div className="overview-grid">{taskPanel}<div className="right-stack">
            <Calendar {...{ entries, today }} compact onOpen={() => go('calendar')} />
            <Workload {...{ members, tasks, memberId }} compact onOpen={() => go('workload')} />
          </div></div>
        </>}
        {page === 'tasks' && taskPanel}
        {page === 'calendar' && <>
          <div className="calendar-view" aria-label={t('Pogled koledarja')}>
            <button className="soft-button" aria-pressed={calendarView === 'month'} onClick={() => setCalendarView('month')}>{t('Mesec')}</button>
            <button className="soft-button" aria-pressed={calendarView === 'week'} onClick={() => setCalendarView('week')}>{t('Teden')}</button>
          </div>
          {calendarView === 'month' ? <MonthCalendar {...{ entries, members, today }}
            onAdd={permissions.create ? date => open('event', date) : undefined} onEdit={canManage ? edit : undefined} /> :
            <Calendar {...{ entries, today }} onAdd={permissions.create ? () => open('event') : undefined} onEdit={canManage ? edit : undefined} />}
        </>}
        {page === 'workload' && <div className="right-stack">
          <Workload {...{ members, tasks, memberId }} />
          {data.admin && <SmartPlanning busy={busy}
            onPreview={(rebalance, setPlan) => run(async () => setPlan(await request('/planning/preview', { rebalance })))}
            onApply={(fields, clearPlan) => run(async () => {
              const result = await request('/planning/apply', fields);
              clearPlan();
              setData(await request('/dashboard'));
              setNotice(result.conflicts
                ? ['Uporabljene dodelitve: %0. Vmes spremenjena opravila: %1.', result.applied, result.conflicts]
                : ['Uporabljene dodelitve: %0.', result.applied]);
            })} />}
        </div>}
        {page === 'profile' && <div className="profile-grid"><section className="panel account-card">
          <h2>{data.profile.firstName} {data.profile.lastName}</h2>
          <p>{data.profile.email}<br />{data.profile.phone}</p>
          {data.profile.emailVerificationPending && <EmailVerificationReminder />}
          <p><strong>{household.name}</strong> · {data.admin ? t('Skrbnik') : t('Član')}</p>
          {data.spaces?.length > 1 && <label className="family-switch">{t('Družinski prostor')}<select value={household.id} disabled={busy} onChange={event => {
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
            <button className="primary" onClick={() => go('overview')}>{t('Odpri nadzorno ploščo')}</button>
            {data.admin && <button className="soft-button" onClick={() => open('family')} disabled={busy}><Plus size={17} />{' '}{t('Nova družina')}</button>}
            <button className="soft-button" onClick={() => open('join')} disabled={busy}>{t('Pridruži se s povabilom')}</button>
          </div>
          {!data.admin && (data.leaveRequested ? <p>{t('Prošnja za izstop čaka na skrbnika.')}</p> :
            <button className="text-button" onClick={() => run(async () => {
              await request('/households/leave', {});
              setData(await request('/dashboard'));
            })} disabled={busy}>{t('Zaprosi za izstop iz prostora')}</button>)}
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
    {modal === 'join' && <Dialog title={t('Pridruži se s povabilom')} onClose={() => { if (!busy) setModal(null); }}>
      <form onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        run(() => joinOrCreate(true, { inviteCode: fields.get('inviteCode') }));
      }}>
        <label>{t('Koda povabila')}<input name="inviteCode" defaultValue={inviteCode} maxLength={32} required spellCheck={false} autoCapitalize="none" /></label>
        {error && <p className="error" role="alert">{errorText(error)}</p>}
        <button className="primary" disabled={busy}>{t('Pridruži se prostoru')}</button>
      </form>
    </Dialog>}
    {modal === 'family' && data.admin && <Dialog title={t('Ustvari novo družino')} onClose={() => { if (!busy) setModal(null); }}>
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
        <label>{t('Ime družine')}<input name="householdName" required maxLength={80} /></label>
        <label>{t('Načrtovano število članov')}<input name="expectedMembers" type="number" min={1} max={100} defaultValue={4} required /></label>
        {error && <p className="error" role="alert">{errorText(error)}</p>}
        <button className="primary" disabled={busy}>{t('Ustvari družinski prostor')}</button>
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
