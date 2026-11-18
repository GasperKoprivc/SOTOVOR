import { t, errorText } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';
import { useState } from 'react';

export function BrandMark({ className }) {
  return <img className={className} src="/sotovor-mark.svg" alt="" width={64} height={64} />;
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark className="brand-icon" />
      Sotovor<span className="brand-dot">.</span>
    </span>
  );
}

export function ChooseHousehold({
  profile,
  busy,
  error,
  onSubmit,
  onLogout,
  inviteCode,
  startJoining,
  verification,
  appearanceControls,
}) {
  const [joining, setJoining] = useState(Boolean(startJoining));
  return (
    <main className="profile-shell">
      {appearanceControls}
      <Brand />
      <LanguageSelect />
      <section className="panel account-card">
        <h1>{t('Živjo, %0!', profile.firstName)}</h1>
        {verification}
        <p>
          {joining
            ? t('Vnesi kodo, ki ti jo je poslal skrbnik družinskega prostora.')
            : t('Ustvari družinski prostor, ki ga boš lahko upravljal in vanj povabil člane.')}
        </p>
        <form
          key={joining}
          onSubmit={(event) => {
            event.preventDefault();
            const fields = Object.fromEntries(new FormData(event.currentTarget));
            onSubmit(
              joining,
              joining ? fields : { ...fields, expectedMembers: Number(fields.expectedMembers) },
            );
          }}
        >
          {joining ? (
            <label>
              {t('Koda povabila')}
              <input name="inviteCode" defaultValue={inviteCode} maxLength={32} required spellCheck={false} />
            </label>
          ) : (
            <>
              <label>
                {t('Ime prostora')}
                <input name="householdName" maxLength={80} required placeholder={t('Npr. Naš dom')} />
              </label>
              <label>
                {t('Število družinskih članov')}
                <input name="expectedMembers" type="number" min={1} max={100} defaultValue={4} required />
              </label>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {joining ? t('Pridruži se prostoru') : t('Ustvari prostor')}
          </button>
        </form>
        <button className="text-button" onClick={() => setJoining(!joining)}>
          {joining ? t('Ustvari nov prostor') : t('Imam kodo povabila')}
        </button>
        <button className="text-button logout-button" onClick={onLogout} disabled={busy}>
          {t('Odjava')}
        </button>
      </section>
    </main>
  );
}
