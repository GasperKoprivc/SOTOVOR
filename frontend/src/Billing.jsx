import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { t, errorText, getLanguage, subscribe } from './i18n.js';
import LanguageSelect from './LanguageSelect.jsx';
import ThemeSelect from './ThemeSelect.jsx';
import { desktopBridge } from './DesktopAccess.jsx';
import { request } from './data.js';
import { pollPayment } from './billing-poll.js';
import './billing.css';

const BillingContext = createContext(null);
export const useBilling = () => useContext(BillingContext);
export const proHref = (id) =>
  '/pro?' +
  new URLSearchParams({ ...(desktopBridge ? { app: 'desktop' } : {}), ...(id ? { space: id } : {}) });
export const profileHref = desktopBridge ? '/?app=desktop#profil' : '/?profile=1#profil';
export async function billingRequest(path, body, signal) {
  const response = await fetch('/api/v1' + path, {
    signal,
    headers: { 'Content-Type': 'application/json', 'Accept-Language': getLanguage() },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error?.message ?? result.error), {
      status: response.status,
      code: result.error?.code,
    });
  return result;
}
export function openBillingUrl(url) {
  const target = new URL(url);
  const stripe =
    target.protocol === 'https:' &&
    ['checkout.stripe.com', 'billing.stripe.com'].includes(target.hostname) &&
    !target.username &&
    !target.password;
  const mock = target.origin === location.origin && target.pathname === '/dev/mock-checkout';
  if (!stripe && !mock) throw new Error('Obračunavanje trenutno ni na voljo.');
  if (desktopBridge) desktopBridge.openExternal(target.href);
  else location.assign(target.href);
}
const featureLabels = {
  members: 'Več družinskih članov',
  planningProposals: 'Več pametnih predlogov',
  voiceNotes: 'Več glasovnih beležk',
  whatsapp: 'Vnos prek WhatsAppa',
  ics: 'Zasebna naročnina na koledar',
  transcription: 'Glas v besedilo',
  allTimeStatistics: 'Statistika za ves čas',
  rewards: 'Točke in nagrade',
  shoppingLists: 'Nakupovalni seznami',
};
export function BillingProvider({ children }) {
  useSyncExternalStore(subscribe, getLanguage);
  const [config, setConfig] = useState(null),
    [spaceId, setSpaceId] = useState(null);
  const [snapshot, setSnapshot] = useState(null),
    [problem, setProblem] = useState('');
  const [upsell, setUpsell] = useState(null);
  const dialog = useRef(null),
    restoreFocus = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    billingRequest('/billing/config', undefined, controller.signal)
      .then(setConfig)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const refresh = useCallback(
    async (signal) => {
      if (!config?.enabled || !spaceId) return;
      try {
        const value = await billingRequest('/spaces/' + spaceId + '/billing', undefined, signal);
        if (!signal?.aborted) {
          setSnapshot(value);
          setProblem('');
        }
        return value;
      } catch (error) {
        if (!signal?.aborted) setProblem(error.message);
      }
    },
    [config?.enabled, spaceId],
  );
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setProblem('');
    setUpsell(null);
    void refresh(controller.signal);
    const focus = () => {
      void refresh(controller.signal);
    };
    window.addEventListener('focus', focus);
    const timer = setInterval(focus, 30000);
    return () => {
      controller.abort();
      window.removeEventListener('focus', focus);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const receive = (event) => {
      if (config?.enabled) setUpsell((current) => current ?? event.detail ?? { feature: '' });
    };
    window.addEventListener('sotovor:plan-required', receive);
    return () => window.removeEventListener('sotovor:plan-required', receive);
  }, [config?.enabled]);
  useEffect(() => {
    if (!upsell) return;
    restoreFocus.current = document.activeElement;
    dialog.current?.showModal();
    return () => restoreFocus.current?.focus?.();
  }, [upsell]);
  function showFeature(feature) {
    setUpsell({ feature });
  }
  return (
    <BillingContext.Provider value={{ config, spaceId, setSpaceId, snapshot, problem, refresh, showFeature }}>
      {children}
      {config?.enabled && upsell && (
        <dialog
          ref={dialog}
          className="pro-dialog"
          aria-labelledby="pro-dialog-title"
          onCancel={(e) => {
            e.preventDefault();
            setUpsell(null);
          }}
        >
          <button className="icon-button pro-close" aria-label={t('Zapri')} onClick={() => setUpsell(null)}>
            ×
          </button>
          <span className="pro-badge">Pro</span>
          <h2 id="pro-dialog-title">{t(featureLabels[upsell.feature] ?? 'Sotovor Pro')}</h2>
          <p>
            {t(
              'Pro odklene to možnost za celoten družinski prostor. Osnovna opravila in koledar ostajajo brezplačni.',
            )}
          </p>
          {upsell.limit != null && (
            <p>{t('Omejitev Free: %0. Trenutno: %1.', upsell.limit, upsell.current)}</p>
          )}
          <p>{t('3 EUR na mesec z DDV ali 30 EUR na leto z DDV.')}</p>
          <a className="primary" href={proHref(spaceId)}>
            {t(snapshot?.mayManageBilling ? 'Oglej si Pro' : 'Prosi skrbnika')}
          </a>
          <button className="text-button" onClick={() => setUpsell(null)}>
            {t('Ostani na Free')}
          </button>
        </dialog>
      )}
    </BillingContext.Provider>
  );
}
export function BillingScope({ id }) {
  const { setSpaceId } = useBilling();
  useEffect(() => {
    setSpaceId(id ?? null);
  }, [id, setSpaceId]);
  return null;
}
export function ProBadge({ feature }) {
  const { config, snapshot } = useBilling();
  if (!config?.enabled || !snapshot) return null;
  const limit = snapshot.entitlements.limits[feature];
  const locked =
    snapshot.entitlements.features[feature] === false || (limit != null && snapshot.usage[feature] >= limit);
  return locked ? <span className="pro-badge">Pro</span> : null;
}
export function FeatureGate({ feature, title, children }) {
  const { config, snapshot, showFeature } = useBilling();
  if (config && !config.enabled) return children;
  if (!snapshot)
    return (
      <section className="panel">
        <h2>{t(title)}</h2>
        <p role="status">{t('Preverjam pravice …')}</p>
      </section>
    );
  if (snapshot.entitlements.features[feature] !== false) return children;
  return (
    <section className="panel pro-locked">
      <h2>
        {t(title)} <span className="pro-badge">Pro</span>
      </h2>
      <p>{t('Na voljo s Sotovor Pro za celotno družino.')}</p>
      <button className="soft-button" onClick={() => showFeature(feature)}>
        {t('O tej možnosti')}
      </button>
    </section>
  );
}
function date(value) {
  return value ? new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'long' }).format(new Date(value)) : '';
}
const statusLabels = {
  none: 'Brez naročnine',
  active: 'Aktivna',
  trialing: 'Preizkus',
  past_due: 'Plačilo ni uspelo',
  canceled: 'Odpovedana',
  expired: 'Potekla',
};
export function PlanState({ value }) {
  const sub = value.subscription;
  const expired =
    (sub.status === 'trialing' && Date.parse(sub.trialEndsAt) <= Date.now()) ||
    (sub.status === 'canceled' && Date.parse(sub.currentPeriodEnd) <= Date.now());
  return (
    <div className="pro-state" aria-live="polite">
      <strong>{value.entitlements.isPro ? 'Sotovor Pro' : 'Sotovor Free'}</strong>
      <p>{t(statusLabels[expired ? 'expired' : sub.status] ?? 'Brez naročnine')}</p>
      {sub.status === 'trialing' && sub.trialEndsAt && (
        <p>
          {t(
            'Preostanek preizkusa: %0 dni.',
            Math.max(0, Math.ceil((Date.parse(sub.trialEndsAt) - Date.now()) / 86400000)),
          )}
        </p>
      )}
      {sub.currentPeriodEnd && ['active', 'trialing', 'canceled'].includes(sub.status) && (
        <p>
          {t(
            sub.cancelAtPeriodEnd ? 'Odpoved velja od %0.' : 'Naslednja obnova: %0.',
            date(sub.currentPeriodEnd),
          )}
        </p>
      )}
      {sub.status === 'past_due' && sub.graceUntil && (
        <p>{t('Rok za ureditev plačila: %0.', date(sub.graceUntil))}</p>
      )}
      {sub.manualGrantUntil && Date.parse(sub.manualGrantUntil) > Date.now() && (
        <p>{t('Dodeljeni Pro velja do %0.', date(sub.manualGrantUntil))}</p>
      )}
    </div>
  );
}
export function BillingProfile() {
  const { config, snapshot, problem, spaceId, refresh } = useBilling();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!config?.enabled) return null;
  async function portal() {
    setBusy(true);
    setError('');
    try {
      openBillingUrl((await billingRequest('/spaces/' + spaceId + '/billing/portal', {})).url);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
      void refresh();
    }
  }
  return (
    <section className="panel billing-profile" aria-label={t('Naročnina')}>
      <h2>{t('Naročnina')}</h2>
      {snapshot ? (
        <>
          <PlanState value={snapshot} />
          {snapshot.mayManageBilling && snapshot.subscription.plan.startsWith('pro_') && (
            <>
              <button className="primary" disabled={busy} onClick={portal}>
                {t('Upravljaj naročnino')}
              </button>
              <p>
                {t(
                  'Računi, plačilna kartica in odpoved so v portalu. Odpoveš lahko kadar koli; dostop ostane do izteka plačanega obdobja.',
                )}
              </p>
            </>
          )}
          <a className="soft-button" href={proHref(spaceId)}>
            {t(snapshot.mayManageBilling ? 'Oglej si Pro' : 'Prosi skrbnika')}
          </a>
        </>
      ) : (
        <p role="status">{t('Preverjam pravice …')}</p>
      )}
      {(error || problem) && <p role="alert">{errorText(error || problem)}</p>}
    </section>
  );
}
const faqs = [
  [
    'Kdo plača naročnino?',
    'Skrbnik plača eno naročnino za celoten družinski prostor. Člani ne plačujejo posebej.',
  ],
  [
    'Kaj se zgodi ob izteku?',
    'Pro možnosti se izključijo, osnovna opravila in koledar pa ostanejo. Podatkov nikoli ne izbrišemo zaradi izteka naročnine.',
  ],
  [
    'Ali lahko kadar koli odpovem?',
    'Da. V profilu izberi Upravljaj naročnino in nato odpoved v portalu. Dostop ostane do izteka plačanega obdobja.',
  ],
  ['Kje najdem račune?', 'Skrbnik najde račune in podatke o plačilih v portalu naročnine.'],
];
function Matrix({ config }) {
  const rows = [
    ['Opravila in skupni koledar', true, true],
    ['Člani v prostoru', config.free.members, config.pro.members],
    ['Pametni predlogi na mesec', config.free.planningProposals, config.pro.planningProposals],
    ['Shranjene glasovne beležke', config.free.voiceNotes, config.pro.voiceNotes],
    ['Skupni nakupovalni seznam', true, true],
    ...['whatsapp', 'ics', 'transcription', 'allTimeStatistics', 'rewards'].map((key) => [
      featureLabels[key],
      config.freeFeatures[key],
      config.proFeatures[key],
    ]),
  ];
  const cell = (value) =>
    value === null
      ? t('Neomejeno')
      : typeof value === 'boolean'
        ? t(value ? 'Vključeno' : 'Ni vključeno')
        : value;
  return (
    <div className="pro-table-wrap">
      <table className="pro-table">
        <caption>{t('Primerjava Free in Pro')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('Možnost')}</th>
            <th scope="col">Free</th>
            <th scope="col">Pro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, free, pro]) => (
            <tr key={name}>
              <th scope="row">{t(name)}</th>
              <td>{cell(free)}</td>
              <td>{cell(pro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ProPage() {
  useSyncExternalStore(subscribe, getLanguage);
  const { config, snapshot, problem, spaceId, setSpaceId, refresh } = useBilling();
  const [dashboard, setDashboard] = useState(undefined),
    [failure, setFailure] = useState('');
  const [plan, setPlan] = useState('monthly'),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const message = useRef(null);
  const returned = new URLSearchParams(location.search).get('billing') === 'success';
  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(location.search).get('space');
    request('/dashboard', undefined, controller.signal, id || null)
      .then((value) => {
        setDashboard(value);
        setSpaceId(value?.household?.id ?? null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFailure(error.message);
          setDashboard(null);
          setSpaceId(null);
        }
      });
    return () => controller.abort();
  }, [setSpaceId]);
  useEffect(() => {
    if (!returned || !config?.enabled || !spaceId || !dashboard?.profile) return;
    const controller = new AbortController();
    setConfirmation('waiting');
    void pollPayment((signal) => billingRequest('/spaces/' + spaceId + '/billing', undefined, signal), {
      signal: controller.signal,
      onConfirmed: () => {
        setConfirmation('confirmed');
        void refresh();
      },
      onTimeout: () => setConfirmation('timeout'),
    });
    return () => controller.abort();
  }, [returned, config?.enabled, spaceId, dashboard?.profile, refresh]);
  async function action(kind) {
    setBusy(true);
    setFailure('');
    try {
      const result = await billingRequest(
        '/spaces/' + spaceId + '/billing/' + kind,
        kind === 'checkout' ? { plan } : {},
      );
      if (kind === 'trial') await refresh();
      else openBillingUrl(result.url);
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  const returnTo = '/pro' + location.search;
  const login = '/?' + new URLSearchParams({ auth: 'login', returnTo });
  const copyMessage = t(
    'Želim uporabiti Sotovor Pro za naš družinski prostor. Stane 3 EUR na mesec ali 30 EUR na leto z DDV. Skrbnik ga lahko vključi tukaj: %0',
    location.origin + proHref(spaceId),
  );
  return (
    <div className="pro-page">
      <header className="pro-header">
        <a className="pro-brand" href={profileHref}>
          SOTOVOR.
        </a>
        <div>
          <LanguageSelect />
          <ThemeSelect />
        </div>
        <a href={profileHref}>{t('Nazaj v Sotovor')}</a>
      </header>
      {!config ? (
        <main>
          <p role="status">{t('Preverjam pravice …')}</p>
        </main>
      ) : !config.enabled ? (
        <main>
          <h1>{t('Vse možnosti so na voljo.')}</h1>
          <p>{t('Na tem strežniku je vse vključeno brez naročnine.')}</p>
        </main>
      ) : (
        <main>
          <section className="pro-hero">
            <span className="pro-badge">Sotovor Pro</span>
            <h1>{t('Več prostora za življenje skupaj.')}</h1>
            <p>{t('En paket za vso družino. Vsakdan ostane preprost.')}</p>
            <div className="pro-switch" aria-label={t('Obračunsko obdobje')}>
              <button aria-pressed={plan === 'monthly'} onClick={() => setPlan('monthly')}>
                {t('Mesečno')}
              </button>
              <button aria-pressed={plan === 'yearly'} onClick={() => setPlan('yearly')}>
                {t('Letno')}
              </button>
            </div>
            <p className="pro-price">
              {plan === 'monthly' ? '3 EUR' : '30 EUR'}{' '}
              <span>{t(plan === 'monthly' ? 'na mesec, z DDV' : 'na leto, z DDV')}</span>
            </p>
            <p>{t('Naročnina velja za en družinski prostor. Brez cene na posameznega člana.')}</p>
            {dashboard === undefined ? (
              <p role="status">{t('Preverjam pravice …')}</p>
            ) : !dashboard?.profile ? (
              <a className="primary" href={login}>
                {t('Najprej se prijavi')}
              </a>
            ) : !dashboard.household ? (
              <a className="primary" href={profileHref}>
                {t('Najprej ustvari družinski prostor')}
              </a>
            ) : (
              <div className="pro-actions">
                {dashboard.spaces?.length > 1 && (
                  <label>
                    {t('Družinski prostor')}
                    <select value={spaceId ?? ''} onChange={(e) => location.assign(proHref(e.target.value))}>
                      {dashboard.spaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {snapshot && (
                  <>
                    <h2>{dashboard.household.name}</h2>
                    <PlanState value={snapshot} />
                    {snapshot.mayManageBilling ? (
                      <>
                        {!['active', 'past_due', 'canceled'].includes(snapshot.subscription.status) ||
                        !snapshot.subscription.plan.startsWith('pro_') ? (
                          <button
                            className="primary"
                            disabled={busy || confirmation === 'waiting'}
                            onClick={() => action('checkout')}
                          >
                            {t('Nadgradi')}
                          </button>
                        ) : null}
                        {!snapshot.subscription.trialUsedAt && !snapshot.entitlements.isPro && (
                          <button className="soft-button" disabled={busy} onClick={() => action('trial')}>
                            {t('Začni 14-dnevni preizkus')}
                          </button>
                        )}
                        {snapshot.subscription.plan.startsWith('pro_') && (
                          <button className="soft-button" disabled={busy} onClick={() => action('portal')}>
                            {t('Upravljaj naročnino')}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <h3>{t('Prosi skrbnika')}</h3>
                        <label>
                          {t('Sporočilo za skrbnika')}
                          <textarea ref={message} readOnly value={copyMessage} rows="4" />
                        </label>
                        <button
                          className="soft-button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(copyMessage);
                              setCopied(true);
                            } catch {
                              message.current.focus();
                              message.current.select();
                            }
                          }}
                        >
                          {t(copied ? 'Sporočilo je kopirano' : 'Kopiraj sporočilo')}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {returned && confirmation && (
              <p role="status">
                {t(
                  {
                    waiting: 'Čakamo na potrditev plačila',
                    confirmed: 'Plačilo je potrjeno. Sotovor Pro je pripravljen.',
                    timeout: 'Potrditev še ni prispela. Preveri stanje pozneje; nakupa ne ponavljaj.',
                  }[confirmation],
                )}
              </p>
            )}
            {(failure || problem) && <p role="alert">{errorText(failure || problem)}</p>}
          </section>
          <Matrix config={config} />
          <section className="pro-faq">
            <h2>{t('Pogosta vprašanja')}</h2>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{t(question)}</summary>
                <p>{t(answer)}</p>
              </details>
            ))}
          </section>
          <footer>
            <a href="/pogoji-narocnine">{t('Pogoji naročnine')}</a>
            <a href="/pogoji">{t('Pogoji uporabe')}</a>
            <a href="/zasebnost">{t('Zasebnost')}</a>
          </footer>
        </main>
      )}
    </div>
  );
}
