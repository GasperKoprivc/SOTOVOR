import { useState, useSyncExternalStore } from 'react';
import { Brand } from './Account.jsx';
import { request } from './data.js';
import { errorText, getLanguage, subscribe, t } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';

export const getVerificationToken = () => new URLSearchParams(location.hash.slice(1)).get('verify-email');

export function EmailVerificationPage({ token }) {
  useSyncExternalStore(subscribe, getLanguage);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await request('/auth/email/verify', { token }, undefined, null);
      history.replaceState(null, '', '/');
      setVerified(true);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-shell">
      <Brand />
      <LanguageSelect />
      <section className="panel account-card">
        <h1>{t('Potrdi e-pošto')}</h1>
        {verified ? (
          <p role="status">{t('E-poštni naslov je potrjen.')}</p>
        ) : (
          <button className="primary family-switch" disabled={busy} onClick={confirm}>
            {t('Potrdi e-poštni naslov')}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {errorText(error)}
          </p>
        )}
        <a className="text-button" href="/">
          {t('Nazaj v Sotovor')}
        </a>
      </section>
    </main>
  );
}

export function EmailVerificationReminder() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function resend() {
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await request('/auth/email/resend', {}, undefined, null);
      setSent(true);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="family-switch">
      <p>{t('Preveri pošto in potrdi svoj e-poštni naslov.')}</p>
      <button type="button" className="soft-button" onClick={resend} disabled={busy}>
        {t('Ponovno pošlji povezavo')}
      </button>
      {sent && <p role="status">{t('Povezava je poslana.')}</p>}
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}
