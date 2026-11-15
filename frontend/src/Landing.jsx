import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ClipboardList,
  House, Mic, Repeat2, UsersRound, X,
} from 'lucide-react';
import '@fontsource-variable/zalando-sans-expanded/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';

const modules = [
  { icon: ClipboardList, color: 'mint', title: 'Skupna opravila', text: 'Dodeli opravilo, prevzemi prosto nalogo ali zaprosi za zamenjavo.', sample: ['Pospravi kuhinjo', 'Prevzem iz šole', 'Pripravi športno torbo'] },
  { icon: CalendarDays, color: 'violet', title: 'Družinski koledar', text: 'Uskladi dogodke in roke v skupnem tedenskem ali mesečnem pogledu.', sample: ['Torek · Trening', 'Četrtek · Zobozdravnik', 'Nedelja · Družinsko kosilo'] },
  { icon: UsersRound, color: 'amber', title: 'Razporeditev dela', text: 'Poglej, kdo ima koliko dela. Ponavljajoča se opravila lahko krožijo med člani.', sample: ['Ana · 3 odprta opravila', 'Matej · 2 odprti opravili', 'Ema · 1 odprto opravilo'] },
];
const satellites = [
  [ClipboardList, 'mint'], [CalendarDays, 'violet'], [Bell, 'amber'],
  [Repeat2, 'blue'], [Mic, 'rose'], [UsersRound, 'mint'],
];

function Mark({ size = 18 }) {
  return <span className="landing-mark" aria-hidden="true"><House size={size} strokeWidth={2.4} /></span>;
}

function AuthDialog({ mode, legacy, busy, error, onAuth, onMode }) {
  const ref = useRef(null);
  const register = mode === 'register';
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} className="landing-auth" aria-labelledby="landing-auth-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onMode(null);
  }} onClick={event => {
    if (event.target === event.currentTarget && !busy) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onMode(null);
    }
  }}>
    <div className="auth-heading"><Mark /><button className="auth-close" aria-label="Zapri" disabled={busy} onClick={() => onMode(null)}><X size={21} /></button></div>
    <h2 id="landing-auth-title">{register ? 'Ustvari račun' : 'Prijava v Sotovor'}</h2>
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
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="launch-button solid" disabled={busy}>{register ? 'Registriraj se' : 'Prijavi se'} <ArrowRight size={17} /></button>
    </form>
    <button className="auth-switch" disabled={busy} onClick={() => onMode(register ? 'login' : 'register')}>
      {register ? 'Že imaš račun? Prijava' : 'Ustvari račun'}
    </button>
  </dialog>;
}

export default function Landing({ legacy, busy, error, onAuth }) {
  const [mode, setMode] = useState(legacy ? 'register' : null);
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(true);
  const selected = modules[active];
  return <div className={`landing ${motion ? '' : 'motion-paused'}`}>
    <header className="landing-header">
      <a className="landing-brand" href="#domov"><Mark /> <span>SOTOVOR</span></a>
      <nav aria-label="Predstavitev"><a href="#funkcije">Funkcije</a><a href="#zacetek">Kako začeti</a></nav>
      <button className="launch-button header-login" onClick={() => setMode('login')}>Prijava <ArrowUpRight size={16} /></button>
    </header>
    <main id="domov">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="orbit-field" aria-hidden="true">
          <span className="orbital-grid" />
          <span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" />
          <span className="orbit orbit-four" /><span className="orbit-origins" />
          {satellites.map(([Icon, color], i) => <span key={i} className={`satellite satellite-${i + 1} palette-${color}`}><Icon strokeWidth={1.5} /></span>)}
        </div>
        <div className="hero-copy">
          <h1 id="hero-title">SOTOVOR<span>.</span></h1>
          <h2>Manj skrbi. Več skupaj.</h2>
          <p>Skupni koledar, opravila in jasen pregled, kdo kaj prevzame. Za vse, ki si delite dom in obveznosti.</p>
          <div className="landing-actions">
            <button className="launch-button solid" onClick={() => setMode('register')}>Ustvari družinski račun <ArrowUpRight size={18} /></button>
            <a className="launch-button outline" href="#funkcije">Razišči funkcije <ArrowDown size={16} /></a>
          </div>
        </div>
        <div className="hero-bottom">
          <a href="#funkcije">Spoznaj Sotovor <ArrowDown size={14} /></a>
          <button className="motion-toggle" aria-pressed={!motion} onClick={() => setMotion(!motion)}>{motion ? 'Ustavi animacije' : 'Zaženi animacije'}</button>
        </div>
      </section>
      <section id="funkcije" className="landing-section products">
        <div className="product-heading"><h2>Vse, kar se dogaja doma.</h2><p>Od prevzema iz šole do nedeljskega kosila. Poglej, kako si lahko razdelite delo.</p></div>
        <div className="module-grid">
          {modules.map(({ icon: Icon, color, title, text }, i) => <button key={title} className="module-card" aria-pressed={active === i}
            aria-controls="module-preview" onClick={() => setActive(i)}>
            <span className={`module-icon palette-${color}`}><Icon size={24} strokeWidth={1.7} /></span>
            <span><strong>{title}</strong><span>{text}</span></span><ArrowUpRight size={18} className="module-arrow" />
          </button>)}
        </div>
        <div id="module-preview" className={`module-preview palette-${selected.color}`}>
          <div key={selected.title} className="module-preview-inner">
            <div><p className="preview-label">Predogled</p><h3>{selected.title}</h3></div>
            <ul>{selected.sample.map(item => <li key={item}><Check size={17} /><span>{item}</span></li>)}</ul>
          </div>
        </div>
      </section>
      <section id="zacetek" className="landing-section landing-start">
        <div><h2>Začnite z enim opravilom.</h2><p>Ustvari prostor, s kodo povabi domače in dodaj prvo skupno opravilo.</p></div>
        <button className="launch-button solid" onClick={() => setMode('register')}>Ustvari račun <ArrowRight size={19} /></button>
      </section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#domov"><Mark /> SOTOVOR</a><a href="#domov">Nazaj na vrh <ArrowUpRight size={16} /></a></footer>
    {mode && <AuthDialog {...{ mode, legacy, busy, error, onAuth }} onMode={setMode} />}
  </div>;
}
