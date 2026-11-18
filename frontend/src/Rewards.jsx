import { useEffect, useState } from 'react';
import { request } from './data.js';
import { errorText, t } from './i18n.js';

export default function Rewards({ householdId, admin }) {
  const [state, setState] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request('/rewards', undefined, controller.signal, householdId).then(setState)
      .catch(error => { if (!controller.signal.aborted) setProblem(errorText(error.message)); });
    return () => controller.abort();
  }, [householdId]);

  async function save(leaderboard, rewards, done) {
    setBusy(true);
    setProblem('');
    try {
      await request('/rewards', { leaderboard, rewards }, undefined, householdId, 'PUT');
      setState(await request('/rewards', undefined, undefined, householdId));
      done?.();
    } catch (error) {
      setProblem(errorText(error.message));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h2>{t('Točke in nagrade')}</h2>
    {problem && <p role="alert">{problem}</p>}
    {state && <>
      {admin && <label className="check-field"><input type="checkbox" checked={state.leaderboard} disabled={busy}
        onChange={event => save(event.target.checked, state.rewards)} /> {t('Prikaži lestvico')}</label>}
      {state.scores.length > 0 && <ul>{state.scores.map(score => <li key={score.id}>{score.name} · {t('%0 točk', score.points)}</li>)}</ul>}
      <ul>{state.rewards.map((reward, index) => <li key={index}>
        {reward.title} · {t('%0 točk', reward.points)}
        {admin && <button className="text-button" disabled={busy}
          onClick={() => save(state.leaderboard, state.rewards.filter((_, i) => i !== index))}>{t('Odstrani')}</button>}
      </li>)}</ul>
      {admin && state.rewards.length < 12 && <form onSubmit={event => {
        event.preventDefault();
        void save(state.leaderboard, [...state.rewards, { title, points: Number(points) }], () => { setTitle(''); setPoints(''); });
      }}>
        <label>{t('Ime nagrade')}<input value={title} maxLength={80} required onChange={event => setTitle(event.target.value)} /></label>
        <label>{t('Potrebne točke')}<input type="number" min="1" max="100000" value={points} required onChange={event => setPoints(event.target.value)} /></label>
        <button className="soft-button" disabled={busy || !title.trim()}>{t('Dodaj nagrado')}</button>
      </form>}
    </>}
  </section>;
}
