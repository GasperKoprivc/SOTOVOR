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

const appPreviews = [
  { title: 'Spletna aplikacija', status: 'Deluje', image: 'web-dashboard.png', width: 1424, height: 805,
    alt: 'Nadzorna plošča družine Novak z opravili, tedenskim koledarjem in razporeditvijo dela',
    text: 'V brskalniku ustvari družinski prostor, povabi člane in spremljaj, kdo je prevzel katero opravilo.' },
  { title: 'Android aplikacija', status: 'Koncept', image: 'mobile-concept.jpg', width: 1536, height: 1024,
    alt: 'Telefon s konceptom mobilnih družinskih opravil in datumskim trakom',
    text: 'Dnevni pregled na poti, s hitrim dostopom do tvojih opravil in možnosti za prevzem.' },
  { title: 'Namizna aplikacija', status: 'Koncept', image: 'desktop-concept.jpg', width: 1536, height: 1024,
    alt: 'Namizni monitor s konceptom aplikacije Sotovor in mesečnim koledarjem',
    text: 'Samostojno okno za načrtovanje tedna ali meseca, ko za računalnikom usklajuješ več obveznosti hkrati.' },
];

function ProductShowcase() {
  return <section id="naprave" className="landing-section product-showcase" aria-labelledby="devices-title">
    <div className="product-heading">
      <h2 id="devices-title">En družinski prostor, več načinov uporabe.</h2>
      <p>Spletna različica že deluje. Za telefon, namizje in domači zaslon si oglej, kako bi lahko Sotovor uporabljali v vsakdanjem življenju.</p>
    </div>
    <figure className="showcase-feature">
      <img src="/showcase/kitchen-display.jpg" width="1536" height="1024" loading="lazy" decoding="async"
        alt="Koncept tablice Sotovor na hladilniku v domači kuhinji z mesečnim družinskim koledarjem" />
      <figcaption>
        <span className="showcase-status">Koncept naprave</span>
        <h3>Družinski zaslon za hladilnik ali steno.</h3>
        <p>Ko greš mimo hladilnika, na hitro pogledaš, kdo danes pobere otroke, kaj je še treba urediti in kateri dogodek je naslednji. Zamisel je zaslon na dotik s skupnim koledarjem, dnevnimi opravili in opomniki na mestu, kjer jih vidi vsa družina.</p>
      </figcaption>
    </figure>
    <div className="showcase-grid">
      {appPreviews.map(({ title, status, image, alt, text, width, height }) => <figure key={title} className="showcase-card">
        <a href={`/showcase/${image}`} target="_blank" rel="noreferrer" aria-label={`Odpri večjo sliko: ${title} (nov zavihek)`}>
          <img src={`/showcase/${image}`} {...{ alt, width, height }} loading="lazy" decoding="async" />
          <span aria-hidden="true"><ArrowUpRight size={19} /></span>
        </a>
        <figcaption>
          <span className="showcase-status">{status}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

function Mark({ size = 18 }) {
  return <span className="landing-mark" aria-hidden="true"><House size={size} strokeWidth={2.4} /></span>;
}

export function AuthDialog({ mode, legacy, busy, error, onAuth, onMode }) {
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

export default function Landing({ signedIn, legacy, busy, error, onAuth, onEnter }) {
  const [mode, setMode] = useState(null);
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(true);
  const selected = modules[active];
  return <div className={`landing ${motion ? '' : 'motion-paused'}`}>
    <header className="landing-header">
      <a className="landing-brand" href="#domov"><Mark /> <span>SOTOVOR</span></a>
      <nav aria-label="Predstavitev"><a href="#funkcije">Funkcije</a><a href="#naprave">Aplikacije in naprava</a><a href="#zgodba">Zakaj Sotovor</a><a href="#zacetek">Kako začeti</a></nav>
      <button className="launch-button header-login" onClick={signedIn ? onEnter : () => setMode('login')}>
        {signedIn ? 'Odpri profil' : 'Prijava'} <ArrowUpRight size={16} />
      </button>
    </header>
    <main id="domov">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="orbit-field" aria-hidden="true">
          <span className="orbital-grid" />
          <span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" />
          <span className="orbit orbit-four" /><span className="orbit-origins" />
          <div className="satellite-track">
            {satellites.map(([Icon, color], i) => <span key={color + i} className="satellite-arm" style={{ '--phase': `${-4 - i * 8}s` }}>
              <span className={`satellite palette-${color}`}><Icon strokeWidth={1.5} /></span>
            </span>)}
          </div>
        </div>
        <div className="hero-copy">
          <h1 id="hero-title">SOTOVOR<span>.</span></h1>
          <h2>Manj skrbi. Več skupaj.</h2>
          <p>Skupni koledar, opravila in jasen pregled, kdo kaj prevzame. Za vse, ki si delite dom in obveznosti.</p>
          <div className="landing-actions">
            <a className="launch-button solid" href="#funkcije">Razišči funkcije <ArrowDown size={16} /></a>
            <a className="launch-button outline" href="#naprave">Oglej si naprave <ArrowDown size={16} /></a>
          </div>
        </div>
        <div className="hero-bottom">
          <a href="#zgodba">Spoznaj Sotovor <ArrowDown size={14} /></a>
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
      <ProductShowcase />
      <section id="zgodba" className="landing-section landing-story" aria-labelledby="story-title">
        <div className="story-copy">
          <h2 id="story-title">Zakaj Sotovor?</h2>
          <p>Gašper Koprivc je pred Sotovorjem doma pozabljal na opravila in družinske dogovore. Pozna tisti trenutek, ko te doma vprašajo, ali si kaj uredil, ti pa se šele takrat spomniš, da si to obljubil.</p>
          <p>Zato je ustvaril skupni prostor, kjer vsi vidijo, kaj je treba narediti, kdo je to prevzel in do kdaj. Ko je treba zamenjati načrt, lahko drugi član prevzame opravilo, ne da bi moral nekdo posebej poklicati vse domače.</p>
        </div>
        <aside className="story-author" aria-label="Avtor Sotovora">
          <span className="story-monogram" aria-hidden="true">GK</span>
          <div><strong>Gašper Koprivc</strong><p>Avtor Sotovora</p></div>
        </aside>
      </section>
      <section id="zacetek" className="landing-section landing-start" aria-labelledby="start-title">
        <div>
          <h2 id="start-title">Začni z enim opravilom.</h2>
          <ol className="start-steps">
            <li>Ustvari družinski prostor.</li>
            <li>S kodo povabi domače.</li>
            <li>Dodaj prvo opravilo in se dogovorite, kdo ga prevzame.</li>
          </ol>
        </div>
        <button className="launch-button solid" onClick={signedIn ? onEnter : () => setMode('register')}>
          {signedIn ? 'Odpri profil' : 'Ustvari račun'} <ArrowRight size={19} />
        </button>
      </section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#domov"><Mark /> SOTOVOR</a><a href="#domov">Nazaj na vrh <ArrowUpRight size={16} /></a></footer>
    {mode && <AuthDialog {...{ mode, legacy, busy, error, onAuth }} onMode={setMode} />}
  </div>;
}
