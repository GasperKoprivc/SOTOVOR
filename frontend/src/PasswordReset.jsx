import { useState, useSyncExternalStore } from 'react';
import { Brand } from './Account.jsx';
import { request } from './data.js';
import { errorText, getLanguage, subscribe, t } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';

export default function PasswordReset({ token }) {
  useSyncExternalStore(subscribe, getLanguage);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const setting = Boolean(token);

  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    setBusy(true);
    try {
      await request(setting ? '/auth/password/reset' : '/auth/password/request',
        setting ? { ...fields, token } : fields, undefined, null);
      if (setting) history.replaceState(null, '', '/');
      setDone(true);
    } catch (problem) {
      setError(problem.status === 404 ? 'Ponastavitev gesla tu ni nastavljena.' : problem.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="profile-shell">
    <Brand />
    <LanguageSelect />
    <section className="panel account-card">
      <h1>{t('Ponastavi geslo')}</h1>
      {done ? <p role="status">{t(setting ? 'Geslo je spremenjeno.' : 'Če račun obstaja, boš prejel povezavo po e-pošti.')}</p> :
        <form onSubmit={submit}>
          {setting ? <label>{t('Geslo')}<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label> :
            <label>{t('E-pošta')}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
          <button className="primary" disabled={busy}>{t(setting ? 'Shrani geslo' : 'Pošlji povezavo')}</button>
        </form>}
      {error && <p className="error" role="alert">{errorText(error)}</p>}
      <a className="text-button" href="/">{t('Nazaj v Sotovor')}</a>
    </section>
  </main>;
}
