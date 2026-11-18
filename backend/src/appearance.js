import { HttpError } from './api-errors.js';

export function registerAppearance(router, { accounts }) {
  router.get('/me/appearance', (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    res.json(req.account.appearance ?? { language: 'sl', theme: 'dark' });
  });
  router.put('/me/appearance', async (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    const { language, theme } = req.body;
    if (!['sl', 'en', 'de'].includes(language) || !['dark', 'light', 'system'].includes(theme)) {
      throw new HttpError(400, 'Izberi veljaven jezik in videz.');
    }
    const appearance = { language, theme };
    const result = await accounts.updateOne({ _id: req.account._id, deletionFamilyIds: { $exists: false } }, { $set: { appearance } });
    if (!result.matchedCount) throw new HttpError(401, 'Najprej se prijavi.');
    res.json(appearance);
  });
}
