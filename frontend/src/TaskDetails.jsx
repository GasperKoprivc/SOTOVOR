import { useEffect, useState } from 'react';
import Transcription from './Transcription.jsx';
import { request } from './data.js';
import { errorText, t } from './i18n.js';

export default function TaskDetails({ task, householdId, transcriptionEnabled }) {
  const [details, setDetails] = useState(null);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const path = '/tasks/' + task.id;
  useEffect(() => {
    const controller = new AbortController();
    request(path + '/details', undefined, controller.signal, householdId)
      .then(setDetails)
      .catch((error) => {
        if (!controller.signal.aborted) setProblem(errorText(error.message));
      });
    return () => controller.abort();
  }, [path, householdId]);

  async function change(suffix, body, method, done) {
    setBusy(true);
    setProblem('');
    try {
      setDetails(await request(path + suffix, body, undefined, householdId, method));
      done?.();
    } catch (error) {
      setProblem(errorText(error.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-details">
      {task.voice && transcriptionEnabled && <Transcription entryId={task.id} />}
      {problem && <p role="alert">{problem}</p>}
      {!details && !problem && <p role="status">{t('Nalaganje seznama …')}</p>}
      {details && (
        <>
          <h3>{t('Podopravila')}</h3>
          <ul>
            {details.checklist.map((item) => (
              <li key={item.id}>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={busy || Boolean(task.completedAt)}
                    onChange={(event) =>
                      change('/checklist/' + item.id, { checked: event.target.checked }, 'PUT')
                    }
                  />
                  {item.title}
                </label>
              </li>
            ))}
          </ul>
          {!task.completedAt && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void change('/checklist', { title }, 'POST', () => setTitle(''));
              }}
            >
              <label>
                {t('Novo podopravilo')}
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <button className="soft-button" disabled={busy || !title.trim()}>
                {t('Dodaj podopravilo')}
              </button>
            </form>
          )}
          <h3>{t('Komentarji')}</h3>
          <ul>
            {details.comments.map((item) => (
              <li key={item.id}>
                <strong>{item.authorName}</strong>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void change('/comments', { text: comment }, 'POST', () => setComment(''));
            }}
          >
            <label>
              {t('Tvoj komentar')}
              <textarea
                required
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            <button className="soft-button" disabled={busy || !comment.trim()}>
              {t('Objavi komentar')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
