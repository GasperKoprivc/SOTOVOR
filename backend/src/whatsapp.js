import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { raw, Router } from 'express';

export function whatsappConfig() {
  const { SOTOVOR_WHATSAPP_APP_SECRET: secret, SOTOVOR_WHATSAPP_VERIFY_TOKEN: verify,
    SOTOVOR_WHATSAPP_PHONE_ID: phoneId } = process.env;
  return secret && verify && phoneId ? { secret, verify, phoneId } : null;
}

export const codeHash = code => createHash('sha256').update(code).digest('hex');

function parseText(body) {
  if (!body || body.length > 200) return;
  const event = /^dogodek\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/iu.exec(body);
  if (event) {
    const [, dueOn, title] = event;
    const date = new Date(dueOn);
    if (!Number.isNaN(+date) && date.toISOString().slice(0, 10) === dueOn && title.length <= 160) {
      return { kind: 'event', title, dueOn };
    }
    return;
  }
  if (/^dogodek\b/iu.test(body)) return;
  const title = body.replace(/^opravilo\s+/iu, '');
  if (title.length <= 160) return { kind: 'task', title, dueOn: null };
}

export function createWhatsApp({ households, entries }, { secret, verify, phoneId }) {
  const router = Router();
  router.get('/', (req, res) => {
    const challenge = req.query['hub.challenge'];
    if (req.query['hub.mode'] !== 'subscribe' || req.query['hub.verify_token'] !== verify ||
        typeof challenge !== 'string' || !/^\d{1,64}$/.test(challenge)) return res.sendStatus(403);
    res.type('text/plain').send(challenge);
  });

  router.post('/', raw({ type: 'application/json', limit: '256kb', inflate: false }), async (req, res) => {
    const signature = req.get('x-hub-signature-256');
    if (!Buffer.isBuffer(req.body) || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return res.sendStatus(403);
    const expected = createHmac('sha256', secret).update(req.body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) return res.sendStatus(403);
    let payload;
    try { payload = JSON.parse(req.body); } catch { return res.sendStatus(400); }
    if (payload?.object !== 'whatsapp_business_account') return res.sendStatus(200);
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages' || change.value?.metadata?.phone_number_id !== phoneId) continue;
        for (const message of change.value.messages ?? []) {
          if (message.type !== 'text' || !/^\d{7,20}$/.test(message.from) ||
              typeof message.id !== 'string' || message.id.length > 256) continue;
          const body = typeof message.text?.body === 'string' ? message.text.body.trim() : '';
          const pairing = /^poveži\s+([a-f0-9]{24})$/iu.exec(body);
          if (pairing) {
            try {
              await households.updateOne({
                'whatsappPairing.hash': codeHash(pairing[1].toLowerCase()),
                'whatsappPairing.expiresAt': { $gt: new Date() },
              }, { $set: { whatsappSender: message.from }, $unset: { whatsappPairing: '' } });
            } catch (error) {
              if (error.code !== 11000) throw error;
            }
            continue;
          }
          const input = parseText(body);
          if (!input) continue;
          const household = await households.findOne({ whatsappSender: message.from }, { projection: { _id: 1 } });
          if (!household) continue;
          await entries.updateOne({ whatsappMessageId: message.id }, { $setOnInsert: {
            ...input, householdId: household._id, category: 'drugo', assigneeId: null,
            completedAt: null, createdAt: new Date(),
          } }, { upsert: true });
        }
      }
    }
    res.sendStatus(200);
  });
  return router;
}
