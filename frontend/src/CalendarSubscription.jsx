import { useEffect, useState } from 'react';
import { request } from './data.js';
import { errorText, t } from './i18n.js';

export default function CalendarSubscription() {
  const [active, setActive] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request('/calendar/subscription', undefined, controller.signal, null)
      .then(value => setActive(value.active))
      .catch(error => { if (!controller.signal.aborted) setError(errorText(error.message)); });
    return () => controller.abort();
  }, []);

  async function change(revoke) {
    setBusy(true);
    setError('');
    try {
      const result = await request('/calendar/subscription', {}, undefined, null, revoke ? 'DELETE' : 'POST');
      setActive(result.active);
      setLink(result.path ? new URL(result.path, window.location.origin).href : '');
    } catch (error) {
      setError(errorText(error.message));
    } finally {
      setBusy(false);
    }
  }

  return <details className="panel">
    <summary>{t('Zasebna naročnina na koledar')}</summary>
    <p>{t('Kdor ima povezavo, lahko vidi dogodke in datirana opravila tvojih družin. Zamenjava povezave prekliče prejšnjo.')}</p>
    <div className="top-actions">
      <button className="soft-button" disabled={active === null || busy} onClick={() => change(false)}>
        {t(active ? 'Zamenjaj povezavo' : 'Ustvari povezavo')}
      </button>
      {active && <button className="soft-button" disabled={busy} onClick={() => change(true)}>{t('Prekliči povezavo')}</button>}
    </div>
    {link && <label>{t('Kopiraj povezavo v svoj koledar')}<input readOnly value={link} onFocus={event => event.target.select()} /></label>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
