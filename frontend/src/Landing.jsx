import { t, errorText } from './i18n.js';
import ThemeSelect from './ThemeSelect.jsx';
import LanguageSelect from './LanguageSelect.jsx';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ClipboardList,
  Mic, Repeat2, UsersRound, X,
} from 'lucide-react';
import { BrandMark } from './Account.jsx';
import { AndroidDownloadBanner } from './Downloads.jsx';
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
  [ClipboardList, 'mint', 'tasks', 'Opravila'], [CalendarDays, 'violet', 'calendar', 'Koledar'],
  [Bell, 'amber', 'reminders', 'Opomniki'], [Repeat2, 'blue', 'recurring', 'Ponavljajoča se opravila'],
  [Mic, 'rose', 'voice', 'Dodaj glasovno beležko'], [UsersRound, 'mint', 'workload', 'Razporeditev dela'],
];

const appPreviews = [
  { title: 'Spletna aplikacija', status: 'Deluje', image: 'web-dashboard.png', width: 1424, height: 805,
    alt: 'Nadzorna plošča družine Novak z opravili, tedenskim koledarjem in razporeditvijo dela',
    text: 'V brskalniku ustvari družinski prostor, povabi člane in spremljaj, kdo je prevzel katero opravilo.' },
  { title: 'Android aplikacija', status: 'Koncept', image: 'mobile-concept.jpg', width: 1536, height: 1024,
    alt: 'Telefon s konceptom mobilnih družinskih opravil in datumskim trakom',
    text: 'Dnevni pregled na poti, s hitrim dostopom do tvojih opravil in možnosti za prevzem.' },
  { title: 'Namizna aplikacija', status: 'Deluje na Windows', image: 'desktop-dashboard.png', width: 1280, height: 850,
    alt: 'Mesečni koledar demo družine Novak v namizni aplikaciji Sotovor',
    text: 'Samostojno okno za Windows s skupnim koledarjem in opravili. Prijavo potrdiš v brskalniku.' },
];

function ProductShowcase() {
  return <section id="naprave" className="landing-section product-showcase" aria-labelledby="devices-title">
    <div className="product-heading">
      <h2 id="devices-title">{t('En družinski prostor, več načinov uporabe.')}</h2>
      <p>{t('Spletna in namizna različica že delujeta. Mobilna aplikacija in domači zaslon sta prikazana kot koncepta.')}</p>
    </div>
    <figure className="showcase-feature">
      <img src="/showcase/kitchen-display.jpg" width="1536" height="1024" loading="lazy" decoding="async"
        alt={t('Koncept tablice Sotovor na hladilniku v domači kuhinji z mesečnim družinskim koledarjem')} />
      <figcaption>
        <span className="showcase-status">{t('Koncept naprave')}</span>
        <h3>{t('Družinski zaslon za hladilnik ali steno.')}</h3>
        <p>{t('Ko greš mimo hladilnika, na hitro pogledaš, kdo danes pobere otroke, kaj je še treba urediti in kateri dogodek je naslednji. Zamisel je zaslon na dotik s skupnim koledarjem, dnevnimi opravili in opomniki na mestu, kjer jih vidi vsa družina.')}</p>
      </figcaption>
    </figure>
    <div className="showcase-grid">
      {appPreviews.map(({ title, status, image, alt, text, width, height }) => <figure key={title} className="showcase-card">
        <a href={`/showcase/${image}`} target="_blank" rel="noreferrer" aria-label={t('Odpri večjo sliko: %0 (nov zavihek)', t(title))}>
          <img src={`/showcase/${image}`} {...{ alt: t(alt), width, height }} loading="lazy" decoding="async" />
          <span aria-hidden="true"><ArrowUpRight size={19} /></span>
        </a>
        <figcaption>
          <span className="showcase-status">{t(status)}</span>
          <h3>{t(title)}</h3>
          <p>{t(text)}</p>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

function Mark() {
  return <BrandMark className="landing-mark" />;
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
    <div className="auth-heading"><Mark /><button className="auth-close" aria-label={t('Zapri')} disabled={busy} onClick={() => onMode(null)}><X size={21} /></button></div>
    <h2 id="landing-auth-title">{register ? t('Ustvari račun') : t('Prijava v Sotovor')}</h2>
    {legacy && register && <p>{t('Račun povežemo z družinskim prostorom, ki je že odprt v tem brskalniku.')}</p>}
    <form key={mode} onSubmit={event => {
      event.preventDefault();
      onAuth(mode, Object.fromEntries(new FormData(event.currentTarget)));
    }}>
      {register && <div className="account-fields">
        <label>{t('Ime')}<input name="firstName" required maxLength={40} autoComplete="given-name" /></label>
        <label>{t('Priimek')}<input name="lastName" required maxLength={50} autoComplete="family-name" /></label>
      </div>}
      <label>{t('E-pošta')}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      {register && <label>{t('Telefonska številka')}<input name="phone" type="tel" required maxLength={25} autoComplete="tel" /></label>}
      <label>{t('Geslo')}<input name="password" type="password" required minLength={register ? 10 : undefined}
        maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      {error && <p className="auth-error" role="alert">{errorText(error)}</p>}
      <button className="launch-button solid" disabled={busy}>{register ? t('Registriraj se') : t('Prijavi se')} <ArrowRight size={17} /></button>
    </form>
    {!register && <a className="auth-switch" href="/#reset-password">{t('Pozabljeno geslo')}</a>}
    <button className="auth-switch" disabled={busy} onClick={() => onMode(register ? 'login' : 'register')}>
      {register ? t('Že imaš račun? Prijava') : t('Ustvari račun')}
    </button>
  </dialog>;
}

export default function Landing({ signedIn, legacy, busy, error, onAuth, onEnter, onJoin, startWithInvite, onLanguage, onTheme }) {
  const [mode, setMode] = useState(startWithInvite ? 'login' : null);
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(true);
  const selected = modules[active];
  return <div className={`landing ${motion ? '' : 'motion-paused'}`}>
    <header className="landing-header">
      <a className="landing-brand" href="#domov"><Mark /> <span>SOTOVOR</span></a>
      <nav aria-label={t('Predstavitev')}><a href="#funkcije">{t('Funkcije')}</a><a href="#naprave">{t('Aplikacije in naprava')}</a><a href="#zgodba">{t('Zakaj Sotovor')}</a><a href="#zacetek">{t('Kako začeti')}</a></nav>
      <a className="header-download" href="/prenesi">{t('Prenesi')}</a>
      <div className="landing-appearance"><LanguageSelect onChange={onLanguage} /><ThemeSelect onChange={onTheme} /></div>
      <button className="launch-button header-login" onClick={() => signedIn ? onEnter('profile') : setMode('login')}>
        {signedIn ? t('Odpri profil') : t('Prijava')} <ArrowUpRight size={16} />
      </button>
    </header>
    <AndroidDownloadBanner />
    <main id="domov">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="orbit-field">
          <div aria-hidden="true">
            <span className="orbital-grid" />
            <span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" />
            <span className="orbit orbit-four" /><span className="orbit-origins" />
          </div>
          <div className="satellite-track">
            {satellites.map(([Icon, color, destination, label], i) => <span key={destination} className="satellite-arm" style={{ '--phase': `${-4 - i * 8}s` }}>
              {signedIn
                ? <button type="button" className={`satellite satellite-link palette-${color}`} onClick={() => onEnter(destination)} title={t(label)} aria-label={t(label)}><Icon strokeWidth={1.5} /></button>
                : <span aria-hidden="true" className={`satellite palette-${color}`}><Icon strokeWidth={1.5} /></span>}
            </span>)}
          </div>
        </div>
        <div className="hero-copy">
          <h1 id="hero-title">SOTOVOR<span>.</span></h1>
          <h2>{t('Manj skrbi. Več skupaj.')}</h2>
          <p>{t('Skupni koledar, opravila in jasen pregled, kdo kaj prevzame. Za vse, ki si delite dom in obveznosti.')}</p>
          <div className="landing-actions">
            <a className="launch-button solid" href="#funkcije">{t('Razišči funkcije')}{' '}<ArrowDown size={16} /></a>
            <a className="launch-button outline" href="#naprave">{t('Oglej si naprave')}{' '}<ArrowDown size={16} /></a>
          </div>
        </div>
        <div className="hero-bottom">
          <a href="#zgodba">{t('Spoznaj Sotovor')}{' '}<ArrowDown size={14} /></a>
          <button className="motion-toggle" aria-pressed={!motion} onClick={() => setMotion(!motion)}>{motion ? t('Ustavi animacije') : t('Zaženi animacije')}</button>
        </div>
      </section>
      <section id="funkcije" className="landing-section products">
        <div className="product-heading"><h2>{t('Vse, kar se dogaja doma.')}</h2><p>{t('Od prevzema iz šole do nedeljskega kosila. Poglej, kako si lahko razdelite delo.')}</p></div>
        <div className="module-grid">
          {modules.map(({ icon: Icon, color, title, text }, i) => <button key={title} className="module-card" aria-pressed={active === i}
            aria-controls="module-preview" onClick={() => setActive(i)}>
            <span className={`module-icon palette-${color}`}><Icon size={24} strokeWidth={1.7} /></span>
            <span><strong>{t(title)}</strong><span>{t(text)}</span></span><ArrowUpRight size={18} className="module-arrow" />
          </button>)}
        </div>
        <div id="module-preview" className={`module-preview palette-${selected.color}`}>
          <div key={selected.title} className="module-preview-inner">
            <div><p className="preview-label">{t('Predogled')}</p><h3>{t(selected.title)}</h3></div>
            <ul>{selected.sample.map(item => <li key={item}><Check size={17} /><span>{t(item)}</span></li>)}</ul>
          </div>
        </div>
      </section>
      <ProductShowcase />
      <section id="zgodba" className="landing-section landing-story" aria-labelledby="story-title">
        <div className="story-copy">
          <h2 id="story-title">{t('Zakaj Sotovor?')}</h2>
          <p>{t('Gašper Koprivc je pred Sotovorjem doma pozabljal na opravila in družinske dogovore. Pozna tisti trenutek, ko te doma vprašajo, ali si kaj uredil, ti pa se šele takrat spomniš, da si to obljubil.')}</p>
          <p>{t('Zato je ustvaril skupni prostor, kjer vsi vidijo, kaj je treba narediti, kdo je to prevzel in do kdaj. Ko je treba zamenjati načrt, lahko drugi član prevzame opravilo, ne da bi moral nekdo posebej poklicati vse domače.')}</p>
        </div>
        <aside className="story-author" aria-label={t('Avtor Sotovora')}>
          <span className="story-monogram" aria-hidden="true">GK</span>
          <div><strong>Gašper Koprivc</strong><p>{t('Avtor Sotovora')}</p></div>
        </aside>
      </section>
      <section id="zacetek" className="landing-section landing-start" aria-labelledby="start-title">
        <div>
          <h2 id="start-title">{t('Začni z enim opravilom.')}</h2>
          <ol className="start-steps">
            <li>{t('Ustvari družinski prostor.')}</li>
            <li>{t('S kodo povabi domače.')}</li>
            <li>{t('Dodaj prvo opravilo in se dogovorite, kdo ga prevzame.')}</li>
          </ol>
        </div>
        <div className="landing-actions">
          <button className="launch-button solid" onClick={() => signedIn ? onEnter('profile') : setMode('register')}>
            {signedIn ? t('Odpri profil') : t('Ustvari račun')} <ArrowRight size={19} />
          </button>
          <button className="launch-button outline" onClick={() => {
            if (signedIn) onEnter('join');
            else { onJoin(); setMode('login'); }
          }}>{t('Pridruži se s povabilom')}</button>
        </div>
      </section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#domov"><Mark /> SOTOVOR</a><a href="/prenesi">{t('Prenesi')}</a><a href="#domov">{t('Nazaj na vrh')}{' '}<ArrowUpRight size={16} /></a></footer>
    {mode && <AuthDialog {...{ mode, legacy, busy, error, onAuth }} onMode={setMode} />}
  </div>;
}
