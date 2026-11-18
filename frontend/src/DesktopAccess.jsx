import { t, errorText } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';
import { useState } from 'react';
import { ArrowUpRight, Monitor } from 'lucide-react';
import { Brand } from './Account.jsx';
import { AuthDialog } from './Landing.jsx';
import { request } from './data.js';

const params = new URLSearchParams(window.location.search);
const link = params.get('desktop_link');
export const desktopLink = /^[0-9a-f]{32}$/.test(link ?? '') ? link : null;
export const desktopBridge = window.sotovorDesktop;

export function DesktopSignIn() {
  const [code, setCode] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');

  async function signIn(mode) {
    setWaiting(true);
    setError('');
    try {
      setCode(await desktopBridge.begin(mode));
      await desktopBridge.finish();
      window.location.reload();
    } catch (problem) {
      setError(problem.message);
      setCode('');
      setWaiting(false);
    }
  }

  return (
    <main className="profile-shell desktop-access">
      <Brand />
      <LanguageSelect />
      <section className="panel account-card">
        <Monitor size={22} aria-hidden="true" />
        <h1>{t('Sotovor za računalnik')}</h1>
        <p>
          {t('Prijava se odpre v privzetem brskalniku. Po potrditvi se družinski prostor odpre v tem oknu.')}
        </p>
        {waiting ? (
          <>
            <p role="status">
              {code ? (
                <>
                  {t('V brskalniku potrdi kodo')} <strong className="desktop-code">{code}</strong>.
                </>
              ) : (
                t('Odpiram brskalnik …')
              )}
            </p>
            <button className="text-button" onClick={() => window.location.reload()}>
              {t('Prekliči povezovanje')}
            </button>
          </>
        ) : (
          <div className="hero-actions">
            <button className="primary" onClick={() => signIn('login')}>
              {t('Prijava v brskalniku')} <ArrowUpRight size={17} />
            </button>
            <button className="soft-button" onClick={() => signIn('register')}>
              {t('Registracija')} <ArrowUpRight size={17} />
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {errorText(error)}
          </p>
        )}
      </section>
    </main>
  );
}

export function DesktopApproval({ profile, legacy, busy, error, onAuth, onLogout }) {
  const [mode, setMode] = useState(profile ? null : params.get('mode') === 'register' ? 'register' : 'login');
  const [approved, setApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState('');
  const code = desktopLink.slice(-6).toUpperCase();

  async function approve() {
    setSubmitting(true);
    setProblem('');
    try {
      await request('/desktop/approve', { id: desktopLink }, undefined, null);
      setApproved(true);
      history.replaceState(null, '', '/');
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="landing profile-shell desktop-access">
      <Brand />
      <LanguageSelect />
      <section className="panel account-card">
        <h1>{t('Poveži namizni Sotovor')}</h1>
        {approved ? (
          <p role="status">{t('Prijava je potrjena. Vrni se v namizno aplikacijo.')}</p>
        ) : (
          <>
            <p>{t('Potrdi samo, če namizno okno prikazuje isto kodo.')}</p>
            <p>
              <strong className="desktop-code">{code}</strong>
            </p>
            {profile ? (
              <>
                <p>
                  {t('Prijavljen račun:')} <strong>{profile.email}</strong>
                </p>
                <div className="hero-actions">
                  <button className="primary" onClick={approve} disabled={submitting}>
                    {t('Potrdi povezavo')}
                  </button>
                  <button className="text-button" onClick={onLogout} disabled={busy || submitting}>
                    {t('Zamenjaj račun')}
                  </button>
                </div>
              </>
            ) : (
              <button className="soft-button" onClick={() => setMode('login')}>
                {t('Prijava')}
              </button>
            )}
            {problem && (
              <p className="error" role="alert">
                {errorText(problem)}
              </p>
            )}
          </>
        )}
      </section>
      {!profile && mode && <AuthDialog {...{ mode, legacy, busy, error, onAuth }} onMode={setMode} />}
    </main>
  );
}
