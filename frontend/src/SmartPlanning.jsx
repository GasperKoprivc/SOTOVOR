import { t } from './i18n.js';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { fromKey, shortDate } from './data.js';

export default function SmartPlanning({ busy, onPreview, onApply }) {
  const [rebalance, setRebalance] = useState(false);
  const [plan, setPlan] = useState(null);

  return <section className="panel smart-planning">
    <div className="panel-heading">
      <div><h2>{t('Pametna razporeditev')}</h2>
        <p>{t('Sotovor predlaga dodelitve glede na vloge, odsotnost in obremenitev članov.')}</p></div>
      <Sparkles size={22} aria-hidden="true" />
    </div>
    <p>{t('Obremenitev temelji na ocenjenih minutah. Opravilo brez ocene šteje 30 minut.')}</p>
    <p className="muted">{t('Predlog zajame naslednjih 7 dni, zamujena opravila in opravila brez roka. Bolnih in odsotnih članov v tem času ne obremenjuje.')}</p>
    <label className="check-field family-switch"><input type="checkbox" checked={rebalance} disabled={busy} onChange={event => {
      setRebalance(event.target.checked); setPlan(null);
    }} />{' '}{t('Prerazporedi tudi že dodeljena opravila razpoložljivih članov')}</label>
    <div className="hero-actions family-switch">
      <button className="primary" disabled={busy} onClick={() => onPreview(rebalance, setPlan)}><Sparkles size={16} />{' '}{t('Pripravi predlog')}</button>
      {plan?.changes.length > 0 && <button className="soft-button" disabled={busy}
        onClick={() => onApply({ rebalance, signature: plan.signature }, () => setPlan(null))}>{t('Potrdi spremembe (%0)', plan.changes.length)}</button>}
    </div>
    {plan && <div className="planning-preview" aria-live="polite">
      <p><strong>{t('Predlagane dodelitve: %0', plan.changes.length)}</strong>{' '}{t('do')}{' '}{shortDate.format(fromKey(plan.until))}</p>
      {plan.skipped > 0 && <p className="muted">{t('Brez primernega člana:')}{' '}{plan.skipped}.</p>}
      {plan.changes.length > 0
        ? <ul>{plan.changes.map(change => <li key={change.id}><span>{change.title}</span><strong>{change.assigneeName}</strong></li>)}</ul>
        : <p className="muted">{t('Trenutno ni novih dodelitev za potrditev.')}</p>}
    </div>}
  </section>;
}
