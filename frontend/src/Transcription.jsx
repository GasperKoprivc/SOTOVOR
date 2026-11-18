import { useState } from 'react';
import { request } from './data.js';
import { errorText, t } from './i18n.js';

export default function Transcription({ entryId }) {
  const [value, setValue] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  async function transcribe() {
    setBusy(true);
    setProblem('');
    try {
      setValue((await request('/entries/' + entryId + '/transcription', {})).text);
    } catch (error) {
      setProblem(errorText(error.message));
    } finally {
      setBusy(false);
    }
  }
  return <details>
    <summary>{t('Glas v besedilo')}</summary>
    <p>{t('Če nadaljuješ, bo posnetek poslan nastavljenemu ponudniku za prepis.')}</p>
    <button type="button" className="soft-button" disabled={busy} onClick={transcribe}>
      {t(busy ? 'Prepisovanje …' : 'Prepiši posnetek')}
    </button>
    {problem && <p role="alert">{problem}</p>}
    {value !== null && <p className="transcript" role="status">{value || t('V posnetku ni bilo prepoznanega besedila.')}</p>}
  </details>;
}
