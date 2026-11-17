import { errorText, t } from './i18n.js';
import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { needsReminder, request } from './data.js';

const settingsPath = '/v1/me/notification-settings';
const labels = { assignments: 'Dodelitve', reminders: 'Opomniki', swaps: 'Zamenjave' };

export default function Notifications({ tasks, memberId, today, onView }) {
  const storageKey = `sotovor-notices-${memberId}`;
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request(settingsPath, undefined, controller.signal, null).then(setSettings).catch(() => {});
    return () => controller.abort();
  }, [memberId]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });
  const notices = tasks.filter(task => !task.completedAt).flatMap(task => {
    if (task.assigneeId === memberId) return [
      ...(task.assignedAt && settings?.assignments !== false ? [{ id: `${task.id}-${task.assignedAt}`, label: 'Dodeljeno tebi', filter: 'mine', task }] : []),
      ...(settings?.reminders !== false && needsReminder(task, today) ? [{ id: `${task.id}-due-${task.dueOn}-${task.assignedAt}`, label: 'Opomnik za rok', filter: 'due', task }] : []),
    ];
    return settings?.swaps !== false && task.coverRequestedAt && !task.assigneeId
      ? [{ id: `${task.id}-${task.coverRequestedAt}`, label: 'Išče se zamenjava', filter: 'available', task }]
      : [];
  }).filter(notice => !dismissed.includes(notice.id));

  function markRead(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the current view usable. */ }
  }

  async function changeSetting(key, checked) {
    setSaving(true);
    setError('');
    try {
      setSettings(await request(settingsPath, { ...settings, [key]: checked }, undefined, null, 'PUT'));
    } catch (problem) {
      setError(problem.message);
    } finally {
      setSaving(false);
    }
  }

  return <details className="notifications">
    <summary className="soft-button"><Bell size={18} />{' '}{t('Obvestila')}{notices.length > 0 && <span>{notices.length}</span>}</summary>
    <div className="panel notification-panel">
      <h2>{t('Obvestila')}</h2>
      {settings && <fieldset>
        <legend>{t('Nastavitve obvestil')}</legend>
        {Object.entries(labels).map(([key, label]) => <label className="check-field" key={key}>
          <input type="checkbox" checked={settings[key]} disabled={saving} onChange={event => changeSetting(key, event.target.checked)} />
          {t(label)}
        </label>)}
      </fieldset>}
      {error && <p className="error" role="alert">{errorText(error)}</p>}
      {notices.length === 0 && <p className="muted">{t('Trenutno nimaš novih obvestil.')}</p>}
      <ul>{notices.map(({ id, label, filter, task }) => <li key={id}>
        <button className="notification-link" onClick={event => {
          event.currentTarget.closest('details').open = false;
          onView(filter);
        }}><small>{t(label)}</small><strong>{task.title}</strong></button>
        <button className="icon-button" aria-label={t("Označi kot prebrano: %0", task.title)} onClick={() => markRead(id)}><Check size={16} /></button>
      </li>)}</ul>
    </div>
  </details>;
}
