import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { errorText, t } from './i18n.js';
import { request } from './data.js';

const settingsPath = '/v1/me/notification-settings';
const labels = { assignments: 'Dodelitve', reminders: 'Opomniki', swaps: 'Zamenjave' };
const noticeTypes = {
  task_comment: ['Nov komentar pri opravilu', 'all'],
  assignment: ['Dodeljeno tebi', 'mine'],
  deadline: ['Opomnik za rok', 'due'],
  overdue: ['Rok je potekel', 'due'],
  swap: ['Išče se zamenjava', 'available'],
  member_joined: ['Nov družinski član', 'family'],
};

export default function Notifications({ tasks, householdId, onView }) {
  const [notices, setNotices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing || document.hidden) return;
      refreshing = true;
      try {
        const page = await request(
          '/v1/notifications?unread=true',
          undefined,
          controller.signal,
          householdId,
        );
        setNotices(page.items);
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem.message);
      } finally {
        refreshing = false;
      }
    }
    request(settingsPath, undefined, controller.signal, null)
      .then(setSettings)
      .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 8000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [householdId]);

  async function markRead(id) {
    try {
      await request('/v1/notifications/' + id + '/read', {}, undefined, householdId, 'PUT');
      setNotices((previous) =>
        previous.map((notice) =>
          notice.id === id ? { ...notice, readAt: new Date().toISOString() } : notice,
        ),
      );
    } catch (problem) {
      setError(problem.message);
    }
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

  const unread = notices.filter((notice) => !notice.readAt);
  return (
    <details className="notifications">
      <summary className="soft-button">
        <Bell size={18} /> {t('Obvestila')}
        {unread.length > 0 && <span>{unread.length}</span>}
      </summary>
      <div className="panel notification-panel">
        <h2>{t('Obvestila')}</h2>
        {settings && (
          <fieldset>
            <legend>{t('Nastavitve obvestil')}</legend>
            {Object.entries(labels).map(([key, label]) => (
              <label className="check-field" key={key}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  disabled={saving}
                  onChange={(event) => changeSetting(key, event.target.checked)}
                />
                {t(label)}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p className="error" role="alert">
            {errorText(error)}
          </p>
        )}
        {unread.length === 0 && <p className="muted">{t('Trenutno nimaš novih obvestil.')}</p>}
        <ul>
          {unread.map(({ id, type, target }) => {
            const [label, filter] = noticeTypes[type] ?? ['Obvestila', 'all'];
            const title = tasks.find((task) => task.id === target.entryId)?.title ?? t(label);
            return (
              <li key={id}>
                <button
                  className="notification-link"
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false;
                    void markRead(id);
                    onView(
                      filter,
                      type === 'task_comment' ? tasks.find((task) => task.id === target.entryId) : null,
                    );
                  }}
                >
                  <strong>{title}</strong>
                  {title !== t(label) && <small>{t(label)}</small>}
                </button>
                <button
                  className="icon-button"
                  aria-label={t('Označi kot prebrano: %0', title)}
                  onClick={() => void markRead(id)}
                >
                  <Check size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
