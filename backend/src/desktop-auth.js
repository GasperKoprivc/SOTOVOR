import { randomBytes } from 'node:crypto';

const linkLifetimeMs = 5 * 60 * 1000;
const hex = (value, size) => typeof value === 'string' && value.length === size && /^[0-9a-f]+$/.test(value);

export function registerDesktopAuth(router, { desktopLinks, setDesktopSession, hash }) {
  router.post('/desktop/start', async (req, res) => {
    const { challenge } = req.body;
    if (!hex(challenge, 64)) return res.status(400).json({ error: 'Neveljavna zahteva za povezavo.' });
    const id = randomBytes(16).toString('hex');
    await desktopLinks.insertOne({ _id: id, challenge, expiresAt: new Date(Date.now() + linkLifetimeMs) });
    res.status(201).json({ id, expiresIn: linkLifetimeMs / 1000 });
  });

  router.post('/desktop/approve', async (req, res) => {
    if (!req.account) return res.status(401).json({ error: 'Najprej se prijavi v brskalniku.' });
    const { id } = req.body;
    if (!hex(id, 32)) return res.status(400).json({ error: 'Neveljavna povezava.' });
    const approved = await desktopLinks.updateOne({
      _id: id, accountId: { $exists: false }, expiresAt: { $gt: new Date() },
    }, { $set: { accountId: req.account._id } });
    if (!approved.matchedCount) return res.status(410).json({ error: 'Povezava je potekla ali je že uporabljena.' });
    res.json({ ok: true });
  });

  router.post('/desktop/exchange', async (req, res) => {
    const { id, verifier } = req.body;
    if (!hex(id, 32) || !hex(verifier, 64)) {
      return res.status(400).json({ error: 'Neveljavna zahteva za povezavo.' });
    }
    const condition = { _id: id, challenge: hash(verifier), expiresAt: { $gt: new Date() } };
    const approved = await desktopLinks.findOneAndDelete({ ...condition, accountId: { $exists: true } });
    if (approved) {
      await setDesktopSession(req, res, approved.accountId);
      return res.json({ ok: true });
    }
    if (await desktopLinks.findOne(condition, { projection: { _id: 1 } })) return res.status(202).json({ pending: true });
    res.status(410).json({ error: 'Povezava je potekla ali je že uporabljena.' });
  });
}
