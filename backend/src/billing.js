import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { validId } from './mobile-auth.js';
import { assertLimit, billingConfiguration, getEntitlements, planRequired } from './entitlements.js';

export function createBilling(database, config = billingConfiguration(), clock = () => new Date()) {
  const { subscriptions, entitlementUsage, billingAudit, entries } = database;
  const subscription = (space) => subscriptions.findOne({ spaceId: space._id });
  async function entitlements(space) {
    return getEntitlements(space, await subscription(space), clock(), config);
  }
  async function assertFeature(space, name) {
    const value = await entitlements(space);
    if (!value.features[name]) throw planRequired(space._id, name);
  }
  const period = () => clock().toISOString().slice(0, 7); // Calendar months use UTC.

  async function consume(space, name, currentCount = 0) {
    if (!config.enabled) return async () => {};
    const value = await entitlements(space);
    const scope = {
      spaceId: space._id,
      feature: name,
      period: name === 'planningProposals' ? period() : 'stored',
    };
    try {
      await entitlementUsage.updateOne(scope, { $setOnInsert: { count: currentCount } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    // Stored recordings can predate billing or have been added while billing was disabled.
    if (name === 'voiceNotes') await entitlementUsage.updateOne(scope, { $max: { count: currentCount } });
    const limit = value.limits[name];
    const used = await entitlementUsage.findOneAndUpdate(
      { ...scope, ...(limit === null ? {} : { count: { $lt: limit } }) },
      { $inc: { count: 1 }, $set: { updatedAt: clock() } },
      { returnDocument: 'after' },
    );
    if (!used) {
      const current = await entitlementUsage.findOne(scope);
      throw planRequired(space._id, name, limit, current.count);
    }
    return () => entitlementUsage.updateOne(scope, { $inc: { count: -1 } });
  }

  async function reserveVoice(space) {
    if (!config.enabled) return async () => {};
    const count = await entries.countDocuments({ householdId: space._id, voice: { $exists: true } });
    return consume(space, 'voiceNotes', count);
  }

  async function memberLimit(space) {
    const value = await entitlements(space);
    const count = space.members.filter((member) => !member.inactive).length;
    assertLimit('members', count, value, space._id);
    return value.limits.members;
  }

  async function snapshot(space, mayManage) {
    const sub = await subscription(space);
    const proposals = await entitlementUsage.findOne({
      spaceId: space._id,
      feature: 'planningProposals',
      period: period(),
    });
    return {
      enabled: config.enabled,
      entitlements: getEntitlements(space, sub, clock(), config),
      usage: {
        period: period(),
        planningProposals: proposals?.count ?? 0,
        members: space.members.filter((m) => !m.inactive).length,
        voiceNotes: await entries.countDocuments({ householdId: space._id, voice: { $exists: true } }),
        shoppingLists: 1,
      },
      subscription: {
        plan: sub?.plan ?? 'free',
        status: sub?.status ?? 'none',
        trialUsedAt: sub?.trialUsedAt ?? null,
        trialEndsAt: sub?.trialEndsAt ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        graceUntil: sub?.graceUntil ?? null,
        manualGrantUntil: sub?.manualGrantUntil ?? null,
      },
      mayManageBilling: mayManage,
    };
  }

  async function startTrial(space, actorAccountId) {
    if (!config.enabled) throw new HttpError(409, 'Obračunavanje ni omogočeno.', 'BILLING_DISABLED');
    await ensureSubscription(space._id);
    const now = clock();
    const result = await subscriptions.findOneAndUpdate(
      { spaceId: space._id, trialUsedAt: null },
      {
        $set: {
          status: 'trialing',
          trialUsedAt: now,
          trialEndsAt: new Date(+now + 14 * 86400_000),
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    if (!result)
      throw new HttpError(
        409,
        'Preizkus Sotovor Pro je bil v tem prostoru že uporabljen.',
        'TRIAL_ALREADY_USED',
      );
    await billingAudit.insertOne({
      spaceId: space._id,
      actorAccountId,
      action: 'trial_started',
      at: now,
      trialEndsAt: result.trialEndsAt,
    });
  }

  async function ensureSubscription(spaceId) {
    try {
      await subscriptions.updateOne(
        { spaceId },
        {
          $setOnInsert: {
            provider: config.provider,
            providerCustomerId: null,
            providerSubscriptionId: null,
            plan: 'free',
            status: 'none',
            trialEndsAt: null,
            trialUsedAt: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            graceUntil: null,
            manualGrantUntil: null,
            updatedAt: clock(),
            lastEventAt: null,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  return {
    config,
    entitlements,
    assertFeature,
    memberLimit,
    consume,
    reserveVoice,
    snapshot,
    startTrial,
    ensureSubscription,
  };
}

export function registerBilling(router, database, billing) {
  async function scope(req) {
    if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
    if (!validId(req.params.id)) throw new HttpError(404, 'Družinski prostor ne obstaja.');
    const space = await database.households.findOne({ _id: new ObjectId(req.params.id) });
    const member = space?.members.find(
      (m) =>
        !m.inactive &&
        (m.accountId?.equals(req.account._id) ||
          m.guestAccountId?.equals(req.account._id) ||
          (space.ownerAccountId?.equals(req.account._id) && m.id === space.ownerId)),
    );
    if (!member) throw new HttpError(403, 'Ta družinski prostor ni dostopen tvojemu računu.');
    return { space, admin: (space.ownerId ?? space.members[0]?.id) === member.id };
  }
  router.get('/spaces/:id/billing', async (req, res) => {
    const { space, admin } = await scope(req);
    res.json(await billing.snapshot(space, admin));
  });
  router.post('/spaces/:id/billing/trial', async (req, res) => {
    const { space, admin } = await scope(req);
    if (!admin) throw new HttpError(403, 'To lahko opravi samo skrbnik prostora.');
    await billing.startTrial(space, req.account._id);
    res.status(201).json(await billing.snapshot(space, true));
  });
}
