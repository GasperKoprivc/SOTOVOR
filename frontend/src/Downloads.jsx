import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Globe2, Laptop, Smartphone, X } from 'lucide-react';
import { Brand } from './Account.jsx';
import { t } from './i18n.js';
import './downloads.css';

export function platformOf(navigator) {
  const device = navigator.userAgentData?.platform || navigator.userAgent;
  if (/android/i.test(device)) return 'android';
  if (/iPhone|iPad|iPod/i.test(device) || (/mac/i.test(device) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(device)) return 'windows';
  if (/mac/i.test(device)) return 'macos';
  if (/linux/i.test(device)) return 'linux';
  return 'web';
}

const platforms = {
  windows: ['Windows', 'Prenesi za Windows', Laptop],
  android: ['Android', 'Prenesi APK', Smartphone],
  macos: ['macOS', 'Prenesi za macOS', Laptop],
  linux: ['Linux', 'Prenesi za Linux', Laptop],
};

export function AndroidDownloadBanner() {
  const key = 'sotovor-dismiss-android-download';
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || window.sotovorDesktop || platformOf(navigator) !== 'android') return null;
  return (
    <aside className="android-download-banner">
      <Smartphone size={18} aria-hidden="true" />
      <a href="/prenesi">{t('Naloži aplikacijo')}</a>
      <button
        type="button"
        className="icon-button"
        aria-label={t('Zapri')}
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(key, '1');
          } catch {
            /* The current page can still dismiss the banner. */
          }
        }}
      >
        <X size={17} />
      </button>
    </aside>
  );
}

function InstallGuide({ platform, signed }) {
  if (platform === 'windows')
    return (
      <details>
        <summary>Kako namestim</summary>
        <p>
          Odpri preneseno datoteko .exe in sledi korakom. Če WebView2 manjka, ga namestitveni program prenese.
          Po namestitvi odpri Sotovor in izberi »Prijava v brskalniku«.
        </p>
        {!signed && (
          <p>
            Pri nepodpisanem namestitvenem programu lahko Windows prikaže SmartScreen. Če si datoteko prenesel
            z uradne domene in preveril kontrolno vsoto, izberi »Več informacij« → »Vseeno zaženi«, če Windows
            ponudi to možnost.
          </p>
        )}
      </details>
    );
  if (platform === 'android')
    return (
      <details>
        <summary>Kako namestim</summary>
        <p>
          Prenesi APK z uradne domene Sotovor in ga odpri. Če Android zahteva dovoljenje, v nastavitvah za
          trenutni brskalnik ali upravitelja datotek vključi »Dovoli namestitev iz tega vira«. Po namestitvi
          lahko dovoljenje izključiš.
        </p>
      </details>
    );
  return null;
}

function Installer({ platform, release, preferred }) {
  const [label, title, Icon] = platforms[platform];
  const asset = release?.downloads?.[platform];
  return (
    <section className={'panel download-card' + (preferred ? ' preferred-download' : '')} id={platform}>
      <div className="download-card-title">
        <Icon size={21} aria-hidden="true" />
        <h2>{label}</h2>
      </div>
      {asset ? (
        <>
          <a className="download-button" href={'/download/' + platform}>
            <ArrowDownToLine size={17} />
            {title}
          </a>
          <dl className="download-meta">
            <div>
              <dt>Različica</dt>
              <dd>{release.version}</dd>
            </div>
            <div>
              <dt>Velikost</dt>
              <dd>
                {new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 1 }).format(
                  asset.size / 1024 / 1024,
                )}{' '}
                MB
              </dd>
            </div>
            <div>
              <dt>Objavljeno</dt>
              <dd>
                {new Intl.DateTimeFormat('sl-SI', {
                  dateStyle: 'medium',
                  timeZone: 'Europe/Ljubljana',
                }).format(new Date(release.publishedAt))}
              </dd>
            </div>
          </dl>
          <dl className="download-checksum">
            <dt>SHA-256</dt>
            <dd>
              <code>{asset.sha256}</code>
            </dd>
          </dl>
        </>
      ) : (
        <p className="muted">Namestitveni program trenutno ni na voljo.</p>
      )}
      {platform === 'android' && release?.playUrl && (
        <a className="soft-button download-play" href={release.playUrl}>
          Google Play <ArrowUpRight size={16} />
        </a>
      )}
      <InstallGuide platform={platform} signed={asset?.signed} />
    </section>
  );
}

export default function Downloads() {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const detected = platformOf(navigator);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/releases/latest', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setRelease)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const primary = release?.downloads?.[detected] ? detected : null;
  const playPrimary = detected === 'android' && !primary && release?.playUrl;
  return (
    <div className="landing download-page">
      <header className="download-header">
        <a href="/" aria-label="Sotovor">
          <Brand />
        </a>
        <a className="soft-button" href="/">
          Na začetno stran
        </a>
      </header>
      <main className="download-main">
        <section className="download-intro">
          <h1>Prenesi Sotovor</h1>
          <p>
            Skupni koledar in družinska opravila na računalniku in telefonu. Po namestitvi se prijavi z istim
            računom.
          </p>
          <a className="download-button" href={primary ? '/download/' + primary : playPrimary || '/'}>
            {primary ? <ArrowDownToLine size={19} /> : <Globe2 size={19} />}
            {primary ? platforms[primary][1] : playPrimary ? 'Google Play' : 'Odpri v brskalniku'}
          </a>
        </section>
        {loading && (
          <p className="muted" role="status">
            Preverjam zadnjo izdajo …
          </p>
        )}
        {error && (
          <p className="muted" role="status">
            Podatki o izdaji trenutno niso dosegljivi.
          </p>
        )}
        {!loading && (
          <div className="download-grid">
            {['windows', 'android', ...['macos', 'linux'].filter((key) => release?.downloads?.[key])].map(
              (platform) => (
                <Installer key={platform} {...{ platform, release }} preferred={platform === primary} />
              ),
            )}
            <section className="panel download-card">
              <div className="download-card-title">
                <Smartphone size={21} aria-hidden="true" />
                <h2>iPhone, iPad in drugi telefoni</h2>
              </div>
              <p>Sotovor se prilagodi zaslonu telefona. Samostojna aplikacija za iOS še ni na voljo.</p>
              <a className="soft-button download-play" href="/">
                Odpri v brskalniku <ArrowUpRight size={16} />
              </a>
            </section>
            <section className="panel download-card">
              <div className="download-card-title">
                <Globe2 size={21} aria-hidden="true" />
                <h2>Splet</h2>
              </div>
              <p>Odpri družinski prostor v katerem koli podprtem brskalniku.</p>
              <a className="soft-button download-play" href="/">
                Odpri v brskalniku <ArrowUpRight size={16} />
              </a>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
