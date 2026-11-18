import { HttpError } from './api-errors.js';

export function registerRewards(router, { households, entries }, requireAdmin) {
  router.get('/rewards', async (req, res) => {
    const { _id, rewardSettings, members } = req.household;
    const children = members.filter(member => !member.inactive && member.familyRole === 'child');
    const leaderboard = rewardSettings?.leaderboard === true;
    const visible = leaderboard ? children : children.filter(member => member.id === req.member.id);
    const earned = await entries.aggregate([
      { $match: { householdId: _id, archivedAt: null, earnedPoints: { $gt: 0 }, assigneeId: { $in: visible.map(member => member.id) } } },
      { $group: { _id: '$assigneeId', total: { $sum: '$earnedPoints' } } },
    ]).toArray();
    const totals = new Map(earned.map(row => [row._id, row.total]));
    const scores = visible.map(member => ({ id: member.id, name: member.name, points: totals.get(member.id) ?? 0 }))
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
    res.json({ leaderboard, rewards: rewardSettings?.rewards ?? [], scores });
  });

  router.put('/rewards', async (req, res) => {
    requireAdmin(req);
    const { leaderboard, rewards } = req.body;
    if (typeof leaderboard !== 'boolean' || !Array.isArray(rewards) || rewards.length > 12 ||
        rewards.some(row => !row || typeof row.title !== 'string' || !row.title.trim() || row.title.trim().length > 80 ||
          !Number.isInteger(row.points) || row.points < 1 || row.points > 100000)) {
      throw new HttpError(400, 'Preveri nazive in točke nagrad.');
    }
    await households.updateOne({ _id: req.household._id }, { $set: {
      rewardSettings: { leaderboard, rewards: rewards.map(row => ({ title: row.title.trim(), points: row.points })) },
    } });
    res.json({ ok: true });
  });
}
