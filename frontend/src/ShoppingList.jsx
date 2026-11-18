import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from './data.js';
import { errorText, t } from './i18n.js';
import './shopping.css';

export default function ShoppingList({ householdId }) {
  const [items, setItems] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const loading = useRef(null);
  const load = useCallback(async () => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    try {
      const result = await request('/shopping', undefined, controller.signal, householdId);
      if (!controller.signal.aborted) {
        setItems(result);
        setProblem('');
      }
    } catch (error) {
      if (!controller.signal.aborted) setProblem(errorText(error.message));
    }
  }, [householdId]);
  useEffect(() => {
    void load();
    const stream = new EventSource('/api/shopping/stream?household=' + encodeURIComponent(householdId));
    stream.addEventListener('refresh', load);
    return () => {
      stream.close();
      loading.current?.abort();
    };
  }, [householdId, load]);

  async function change(path, body, method, done) {
    setBusy(true);
    setProblem('');
    try {
      await request(path, body, undefined, householdId, method);
      done?.();
      await load();
    } catch (error) {
      setProblem(errorText(error.message));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel shopping-panel">
    <h2>{t('Skupni nakupovalni seznam')}</h2>
    <form className="shopping-form" onSubmit={event => {
      event.preventDefault();
      void change('/shopping', { title, quantity }, 'POST', () => { setTitle(''); setQuantity(''); });
    }}>
      <label>{t('Izdelek')}<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required /></label>
      <label>{t('Količina')}<input value={quantity} onChange={event => setQuantity(event.target.value)} maxLength={40} /></label>
      <button className="primary" disabled={busy || !title.trim()}>{t('Dodaj izdelek')}</button>
    </form>
    {problem && <p role="alert">{problem} <button onClick={load}>{t('Osveži seznam')}</button></p>}
    {!problem && items === null && <p role="status">{t('Nalaganje seznama …')}</p>}
    {items?.length === 0 && <p>{t('Nakupovalni seznam je prazen.')}</p>}
    <ul className="shopping-items">{items?.map(item => <li key={item.id}>
      <label>
        <input type="checkbox" checked={Boolean(item.checkedAt)} disabled={busy}
          onChange={event => change('/shopping/' + item.id, { checked: event.target.checked }, 'PUT')} />
        <span><strong className={item.checkedAt ? 'shopping-checked' : undefined}>{item.title}</strong>
          {item.quantity && <small>{item.quantity}</small>}
          {item.checkedByName && <small>{t('Kupil/a: %0', item.checkedByName)}</small>}
        </span>
      </label>
      <button type="button" className="secondary" disabled={busy} aria-label={t('Odstrani %0', item.title)}
        onClick={() => change('/shopping/' + item.id, {}, 'DELETE')}>{t('Odstrani')}</button>
    </li>)}</ul>
  </section>;
}
