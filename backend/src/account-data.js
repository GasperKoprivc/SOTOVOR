import { HttpError } from './api-errors.js';
import { ObjectId } from 'mongodb';
import { publicProfile, verifyPassword } from './accounts.js';

export function registerAccountData(
  router,
  {
    accounts,
    households,
    entries,
    shoppingItems,
    notifications,
    sessions,
    mobileSessions,
    devices,
    subscriptions,
    entitlementUsage,
    billingAudit,
  },
) {
  router.get('/me/export', async (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    const registeredAt = req.account._id.getTimestamp();
    const spaceIds = req.spaces.map((space) => new ObjectId(space.id));
    const exportedEntries = await entries
      .find({ householdId: { $in: spaceIds } }, { projection: { nextOccurrence: 0, whatsappMessageId: 0 } })
      .toArray();
    const exportedShopping = await shoppingItems
      .find({ householdId: { $in: spaceIds } }, { projection: { whatsappMessageId: 0 } })
      .toArray();
    const registeredDevices = await mobileSessions
      .find(
        { accountId: req.account._id },
        {
          projection: { _id: 0, deviceName: 1, createdAt: 1, lastUsedAt: 1 },
        },
      )
      .toArray();
    res.attachment('sotovor-data.json').json({
      profile: publicProfile(req.account),
      registeredAt,
      emailVerifiedAt: req.account.emailVerifiedAt ?? null,
      spaces: req.spaces,
      shoppingPush: req.account.shoppingPush === true,
      notificationSettings: req.account.notificationSettings ?? {},
      devices: registeredDevices,
      entries: exportedEntries.map(({ _id, householdId, voice, ...entry }) => ({
        id: String(_id),
        spaceId: String(householdId),
        ...entry,
        ...(voice
          ? { voice: { mime: voice.mime, data: Buffer.from(voice.bytes.value()).toString('base64') } }
          : {}),
      })),
      shoppingItems: exportedShopping.map(({ _id, householdId, ...item }) => ({
        id: String(_id),
        spaceId: String(householdId),
        ...item,
      })),
    });
  });
  router.delete('/me', async (req, res) => {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    if (
      typeof req.body?.password !== 'string' ||
      req.body.password.length > 128 ||
      !(await verifyPassword(req.body.password, req.account.passwordHash))
    ) {
      throw new HttpError(403, 'Geslo ni pravilno.');
    }
    const accountId = req.account._id;
    const owned =
      req.account.deletionFamilyIds ??
      (
        await households
          .find(
            { ownerAccountId: accountId },
            {
              projection: { _id: 1 },
            },
          )
          .toArray()
      ).map((family) => family._id);
    if (owned.length && req.body.deleteOwnedFamilies !== true) {
      throw new HttpError(
        409,
        'Potrdi tudi izbris družinskih prostorov, ki jih upravljaš.',
        'owned_families',
      );
    }
    const locked = await accounts.updateOne(
      { _id: accountId, passwordHash: req.account.passwordHash },
      { $set: { deletionFamilyIds: owned } },
    );
    if (!locked.matchedCount) throw new HttpError(409, 'Račun se je spremenil. Poskusi znova.');

    const ownedScope = { householdId: { $in: owned } };
    await households.deleteMany({ _id: { $in: owned }, ownerAccountId: accountId });
    await Promise.all([
      entries.deleteMany(ownedScope),
      shoppingItems.deleteMany(ownedScope),
      subscriptions.deleteMany({ spaceId: { $in: owned } }),
      entitlementUsage.deleteMany({ spaceId: { $in: owned } }),
      billingAudit.deleteMany({ spaceId: { $in: owned } }),
      billingAudit.updateMany({ actorAccountId: accountId }, { $unset: { actorAccountId: '' } }),
      notifications.deleteMany({ $or: [ownedScope, { accountId }] }),
      households.updateMany(
        { $or: [{ 'members.accountId': accountId }, { 'members.guestAccountId': accountId }] },
        {
          $set: { 'members.$[member].inactive': true, 'members.$[member].name': 'Nekdanji član' },
          $unset: {
            'members.$[member].accountId': '',
            'members.$[member].guestAccountId': '',
            'members.$[member].leaveRequestedAt': '',
          },
        },
        {
          arrayFilters: [
            { $or: [{ 'member.accountId': accountId }, { 'member.guestAccountId': accountId }] },
          ],
        },
      ),
      devices.deleteMany({ accountId }),
    ]);
    await accounts.deleteOne({ _id: accountId });
    await Promise.all([sessions.deleteMany({ accountId }), mobileSessions.deleteMany({ accountId })]);
    res.json({ ok: true });
  });
}
