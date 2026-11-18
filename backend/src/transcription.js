import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { validId } from './mobile-auth.js';

const formats = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

export function transcriptionProvider(env = process.env, fetcher = fetch) {
  if (env.SOTOVOR_TRANSCRIPTION_ENABLED !== '1') return null;
  const endpoint = URL.parse(env.SOTOVOR_TRANSCRIPTION_URL ?? '');
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('SOTOVOR_TRANSCRIPTION_URL must name an HTTP(S) transcription endpoint.');
  }
  return {
    async transcribe(bytes, mime) {
      if (!formats[mime]) throw new Error('Unsupported transcription format.');
      const form = new FormData();
      form.set('file', new Blob([bytes], { type: mime }), 'note.' + formats[mime]);
      form.set('model', env.SOTOVOR_TRANSCRIPTION_MODEL || 'whisper-1');
      const response = await fetcher(endpoint, {
        method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(45_000),
        headers: env.SOTOVOR_TRANSCRIPTION_TOKEN ? { Authorization: 'Bearer ' + env.SOTOVOR_TRANSCRIPTION_TOKEN } : {},
      });
      if (!response.ok) throw new Error('Transcription provider failed.');
      const { text } = await response.json();
      if (typeof text !== 'string') throw new Error('Invalid transcription response.');
      return text.trim().slice(0, 8000);
    },
  };
}

export function registerTranscription(router, { entries }, provider) {
  const active = new Set();
  router.post('/entries/:id/transcription', async (req, res) => {
    if (!provider || !validId(req.params.id)) throw new HttpError(404, 'Prepis ni na voljo.');
    const entry = await entries.findOne({ _id: new ObjectId(req.params.id), householdId: req.household._id, archivedAt: null },
      { projection: { voice: 1 } });
    if (!entry?.voice) throw new HttpError(404, 'Posnetek ne obstaja.');
    const actor = String(req.account?._id ?? req.member.id);
    if (active.size >= 4 || active.has(actor)) throw new HttpError(429, 'Prepis že poteka. Poskusi čez trenutek.');
    active.add(actor);
    try {
      res.json({ text: await provider.transcribe(Buffer.from(entry.voice.bytes.value()), entry.voice.mime) });
    } catch {
      throw new HttpError(502, 'Prepis trenutno ni na voljo.');
    } finally {
      active.delete(actor);
    }
  });
}
