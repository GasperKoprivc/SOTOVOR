import { useEffect, useState, useSyncExternalStore } from 'react';
import { useBilling, billingRequest, profileHref } from './Billing.jsx';
import LanguageSelect from './LanguageSelect.jsx';
import { t, getLanguage, subscribe } from './i18n.js';
const sections = {
  '/pogoji': ['Pogoji uporabe', 'TODO: upravljavec, kontakt, veljavno pravo in pravila uporabe.'],
  '/zasebnost': [
    'Zasebnost',
    'TODO: upravljavec podatkov, nameni, pravne podlage, hramba, pravice posameznika in kontakt.',
  ],
  '/pogoji-narocnine': [
    'Pogoji naročnine',
    'TODO: pregled naročniških pogojev pred objavo in resničnimi plačili.',
  ],
};
export default function LegalPage() {
  useSyncExternalStore(subscribe, getLanguage);
  const { config } = useBilling();
  const [terms, setTerms] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    billingRequest('/legal/terms', undefined, controller.signal)
      .then((value) => setTerms(value.text))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const path = location.pathname.replace(/\/$/, ''),
    [title, todo] = sections[path];
  const privacy = path === '/zasebnost';
  return (
    <div className="pro-page">
      <header className="pro-header">
        <a className="pro-brand" href={profileHref}>
          SOTOVOR.
        </a>
        <LanguageSelect />
      </header>
      <main>
        <h1>{t(title)}</h1>
        <p className="legal-todo">
          {t('TODO — potreben človeški in pravni pregled. Ta osnutek še ni odobreno pravno besedilo.')}
        </p>
        <p>{t(todo)}</p>
        {config?.enabled && (
          <section>
            <h2>{t(privacy ? 'Plačilni podatki' : 'Naročnina Sotovor Pro')}</h2>
            {privacy ? (
              <p>
                {t(
                  'TODO: navedi plačilnega ponudnika, njegove vloge pri obdelavi podatkov, prejemnike, prenose, roke hrambe in povezavo do njegove politike zasebnosti. Vloge obdelovalca in samostojnega upravljavca mora potrditi pravni pregled. Sotovor ne prejema podatkov o kartici; plačilo se uredi pri ponudniku.',
                )}
              </p>
            ) : (
              <>
                <p>{t('Cena je 3 EUR na mesec ali 30 EUR na leto, z DDV, za en družinski prostor.')}</p>
                <p>
                  {t(
                    'Naročnina se samodejno obnavlja, dokler je ne odpoveš. V profilu izberi Upravljaj naročnino za portal ponudnika; tam so tudi računi. Po odpovedi dostop ostane do izteka plačanega obdobja. Iztek ne izbriše podatkov.',
                  )}
                </p>
                <p className="legal-todo">
                  {t(
                    'TODO: dopolni pravila vračil in 14-dnevnega odstopa pri digitalnih storitvah, zahtevo za takojšen začetek, morebitni sorazmerni znesek ter zakonske izjeme. Soglasje samo po sebi ne pomeni samodejne izgube vseh pravic do odstopa.',
                  )}
                </p>
              </>
            )}
          </section>
        )}
        {terms && path !== '/zasebnost' && (
          <section>
            <h2>{t('Besedilo upravljavca')}</h2>
            <p className="legal-copy">{terms}</p>
          </section>
        )}
        <footer>
          <a href="/pogoji">{t('Pogoji uporabe')}</a>
          <a href="/pogoji-narocnine">{t('Pogoji naročnine')}</a>
          <a href="/zasebnost">{t('Zasebnost')}</a>
          <a href={profileHref}>{t('Nazaj v Sotovor')}</a>
        </footer>
      </main>
    </div>
  );
}
