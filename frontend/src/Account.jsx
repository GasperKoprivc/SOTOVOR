import { useState } from 'react';

export function BrandMark({ className }) {
  return <img className={className} src="/sotovor-mark.svg" alt="" width={64} height={64} />;
}

export function Brand() {
  return <span className="brand"><BrandMark className="brand-icon" />Sotovor<span className="brand-dot">.</span></span>;
}

export function ChooseHousehold({ profile, busy, error, onSubmit, onLogout, inviteCode, startJoining }) {
  const [joining, setJoining] = useState(Boolean(startJoining));
  return <main className="profile-shell">
    <Brand />
    <section className="panel account-card">
      <h1>Živjo, {profile.firstName}!</h1>
      <p>{joining ? 'Vnesi kodo, ki ti jo je poslal skrbnik družinskega prostora.' : 'Ustvari družinski prostor, ki ga boš lahko upravljal in vanj povabil člane.'}</p>
      <form key={joining} onSubmit={event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        onSubmit(joining, joining ? fields : { ...fields, expectedMembers: Number(fields.expectedMembers) });
      }}>
        {joining ? <label>Koda povabila<input name="inviteCode" defaultValue={inviteCode} maxLength={32} required spellCheck={false} /></label> : <>
          <label>Ime prostora<input name="householdName" maxLength={80} required placeholder="Npr. Naš dom" /></label>
          <label>Število družinskih članov<input name="expectedMembers" type="number" min={1} max={100} defaultValue={4} required /></label>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{joining ? 'Pridruži se prostoru' : 'Ustvari prostor'}</button>
      </form>
      <button className="text-button" onClick={() => setJoining(!joining)}>{joining ? 'Ustvari nov prostor' : 'Imam kodo povabila'}</button>
      <button className="text-button logout-button" onClick={onLogout} disabled={busy}>Odjava</button>
    </section>
  </main>;
}
