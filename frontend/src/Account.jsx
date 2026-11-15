import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, House, ListTodo, UsersRound } from 'lucide-react';

export function Brand() {
  return <span className="brand"><span className="brand-icon"><House size={21} strokeWidth={2.3} /></span>Sotovor<span className="brand-dot">.</span></span>;
}

export function Landing({ legacy, busy, error, onAuth }) {
  const [mode, setMode] = useState(legacy ? 'register' : null);
  const register = mode === 'register';
  function open(next) {
    setMode(next);
    requestAnimationFrame(() => document.getElementById('racun')?.scrollIntoView({ block: 'nearest' }));
  }

  return <div className="landing">
    <header className="landing-header">
      <a href="#" aria-label="Sotovor, domov"><Brand /></a>
      <nav aria-label="Predstavitev"><a href="#funkcije">Kaj ponuja Sotovor</a><button className="soft-button" onClick={() => open('login')}>Prijava</button></nav>
    </header>
    <main>
      <section className="landing-hero">
        <div className="hero-copy">
          <h1>Manj skrbi.<br /><em>Več skupaj.</em></h1>
          <p>Razporedite opravila, uskladite družinski koledar in si porazdelite delo, ki ga doma pogosto nihče ne opazi.</p>
          {!mode && <div className="hero-actions">
            <button className="primary" onClick={() => open('register')}>Ustvari račun <ArrowRight size={19} /></button>
            <button className="text-button" onClick={() => open('login')}>Že imaš račun?</button>
          </div>}
        </div>
        {mode ? <section className="panel account-card" id="racun">
          <h2>{register ? 'Ustvari račun' : 'Prijava v Sotovor'}</h2>
          {legacy && register && <p>Račun povežemo z družinskim prostorom, ki je že odprt v tem brskalniku.</p>}
          <form key={mode} onSubmit={event => {
            event.preventDefault();
            onAuth(mode, Object.fromEntries(new FormData(event.currentTarget)));
          }}>
            {register && <div className="account-fields">
              <label>Ime<input name="firstName" required maxLength={40} autoComplete="given-name" /></label>
              <label>Priimek<input name="lastName" required maxLength={50} autoComplete="family-name" /></label>
            </div>}
            <label>E-pošta<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            {register && <label>Telefonska številka<input name="phone" type="tel" required maxLength={25} autoComplete="tel" /></label>}
            <label>Geslo<input name="password" type="password" required minLength={register ? 10 : undefined}
              maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>{register ? 'Registriraj se' : 'Prijavi se'} <ArrowRight size={17} /></button>
          </form>
          <button className="text-button" onClick={() => setMode(register ? 'login' : 'register')}>
            {register ? 'Že imaš račun? Prijava' : 'Ustvari račun'}
          </button>
        </section> : <div className="hero-preview" aria-hidden="true">
          <div className="preview-top"><span><House size={18} /> Naš družinski prostor</span><span className="preview-avatars"><b>A</b><b>M</b><b>L</b><b>E</b></span></div>
          <div className="preview-content">
            <div><strong>Ta teden doma</strong><div className="preview-week">{['P', 'T', 'S', 'Č', 'P', 'S', 'N'].map((day, i) => <span key={i} className={i === 2 ? 'selected' : ''}>{day}<b>{9 + i}</b></span>)}</div></div>
            <div className="preview-task"><Check size={17} /><span><b>Pripravi športno torbo</b><small>Luka · danes</small></span></div>
            <div className="preview-task"><CalendarDays size={17} /><span><b>Družinsko kosilo</b><small>Vsi · nedelja</small></span></div>
          </div>
        </div>}
      </section>
      <section id="funkcije" className="landing-features">
        <h2>Kako vam Sotovor pomaga</h2>
        <div>{[
          [ListTodo, 'Opravila in zamenjave', 'Določite odgovorno osebo, prevzemite prosto opravilo ali prosite za zamenjavo.'],
          [CalendarDays, 'Skupni koledar', 'Poglejte, kaj vas čaka v tednu ali mesecu, in pravočasno opazite bližnje roke.'],
          [UsersRound, 'Razporeditev dela', 'Preverite, kdo ima koliko dela, in izmenjujte odgovornost pri ponavljajočih se opravilih.'],
        ].map(([Icon, title, text]) => <article className="panel" key={title}><span className="metric-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
    </main>
  </div>;
}

export function ChooseHousehold({ profile, busy, error, onSubmit, onLogout }) {
  const [joining, setJoining] = useState(false);
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
        {joining ? <label>Koda povabila<input name="inviteCode" maxLength={32} required spellCheck={false} /></label> : <>
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
