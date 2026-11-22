import { ObjectId } from 'mongodb';
import { HttpError } from '../api-errors.js';
import { flushBillingAudit } from '../billing-audit.js';
import { billingEmail } from './text.js';

const day = 86400_000;
const terminal = (sub) => !sub || ['canceled', 'incomplete_expired'].includes(sub.status);
export function createBillingRuntime(
  database,
  billing,
  provider,
  config,
  { clock = () => new Date(), sendMail } = {},
) {
  const { subscriptions, households, accounts, billingEvents, billingJobs, billingMail } = database;
  async function leased(key, work) {
    const token = new ObjectId().toHexString();
    try {
      await billingJobs.updateOne({ _id: key }, { $setOnInsert: { until: new Date(0) } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const claimed = await billingJobs.findOneAndUpdate(
      { _id: key, until: { $lte: clock() } },
      { $set: { token, until: new Date(+clock() + 60000) } },
      { returnDocument: 'after' },
    );
    if (!claimed) return false;
    const heartbeat = setInterval(() => {
      void billingJobs
        .updateOne({ _id: key, token }, { $set: { until: new Date(+clock() + 60000) } })
        .catch(() => {});
    }, 20000);
    heartbeat.unref();
    try {
      await work(token);
      return true;
    } finally {
      clearInterval(heartbeat);
      await billingJobs.updateOne({ _id: key, token }, { $set: { until: new Date(0) } });
    }
  }

  async function enqueue(event) {
    if (!event) return;
    // No raw webhook/customer/card payload is retained.
    const safe = {
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      subscriptionId: event.subscriptionId,
      provider: config.provider,
    };
    try {
      await billingEvents.updateOne(
        { provider: config.provider, id: safe.id },
        { $setOnInsert: { ...safe, retryAt: clock(), attempts: 0 } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  async function mail(spaceId, subscriptionId, kind, episode) {
    await billingMail.updateOne(
      { _id: `${config.provider}:${subscriptionId}:${kind}:${episode}` },
      {
        $setOnInsert: {
          spaceId,
          providerSubscriptionId: subscriptionId,
          episode,
          kind,
          retryAt: clock(),
          attempts: 0,
        },
      },
      { upsert: true },
    );
  }

  async function sync(subscriptionId, event = null) {
    let record = await subscriptions.findOne({
      provider: config.provider,
      providerSubscriptionId: subscriptionId,
    });
    const fetched = record ? null : await provider.getSubscription(subscriptionId);
    const spaceId =
      record?.spaceId ??
      (/^[a-f0-9]{24}$/.test(fetched?.spaceId ?? '') ? new ObjectId(fetched.spaceId) : null);
    if (!spaceId || !(await households.findOne({ _id: spaceId }))) return true; // Deleted/foreign spaces cannot be recreated by webhooks.
    await billing.ensureSubscription(spaceId);
    return leased('space:' + spaceId, async () => {
      const token = new ObjectId().toHexString();
      const now = clock();
      // Fencing token lives in the same document as the state update; an expired worker cannot overwrite a successor.
      record = await subscriptions.findOneAndUpdate(
        { spaceId, $or: [{ 'billingLease.until': { $lte: now } }, { billingLease: { $exists: false } }] },
        { $set: { billingLease: { token, until: new Date(+now + 60000) } } },
        { returnDocument: 'after' },
      );
      if (!record) throw new Error('Billing space is busy.');
      try {
        const outOfOrder = Boolean(event && record.lastEventAt && +event.createdAt <= +record.lastEventAt);
        const current = await provider.getSubscription(subscriptionId);
        const invalidBinding = Boolean(
          current &&
          (current.spaceId !== String(spaceId) ||
            current.id !== subscriptionId ||
            !['monthly', 'yearly'].includes(current.plan) ||
            typeof current.customerId !== 'string' ||
            !current.customerId ||
            !(current.currentPeriodEnd instanceof Date) ||
            !Number.isFinite(+current.currentPeriodEnd) ||
            (record.providerCustomerId && current.customerId !== record.providerCustomerId) ||
            (current.status === 'trialing' && !(+current.trialEndsAt > 0))),
        );
        if (record.providerSubscriptionId && record.provider !== config.provider)
          throw new Error('Provider migration requires operator review.');
        if (record.providerSubscriptionId && record.providerSubscriptionId !== subscriptionId) {
          if (!terminal(await provider.getSubscription(record.providerSubscriptionId)))
            throw new Error('A different provider subscription is still open.');
        }
        if (!current && !record.providerSubscriptionId) return;
        if (record.providerSubscriptionId !== subscriptionId && terminal(current)) return;
        const rawStatus = invalidBinding ? 'unsupported' : (current?.status ?? 'canceled');
        const status =
          current?.cancelAtPeriodEnd && ['active', 'trialing'].includes(rawStatus)
            ? 'canceled'
            : rawStatus === 'active'
              ? 'active'
              : rawStatus === 'trialing'
                ? 'trialing'
                : ['past_due', 'unpaid'].includes(rawStatus)
                  ? 'past_due'
                  : 'expired';
        const graceUntil =
          status === 'past_due'
            ? record.status === 'past_due' && record.graceUntil
              ? record.graceUntil
              : new Date(+now + 7 * day)
            : null;
        const fields = {
          provider: config.provider,
          providerStatus: rawStatus,
          providerSubscriptionId: subscriptionId,
          providerCustomerId: invalidBinding
            ? record.providerCustomerId
            : (current?.customerId ?? record.providerCustomerId),
          plan: current && !invalidBinding ? 'pro_' + current.plan : record.plan,
          status,
          currentPeriodEnd: !invalidBinding
            ? (current?.currentPeriodEnd ?? record.currentPeriodEnd)
            : record.currentPeriodEnd,
          cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
          graceUntil,
          graceEpisode:
            status === 'past_due'
              ? record.status === 'past_due'
                ? (record.graceEpisode ?? String(+graceUntil))
                : new ObjectId().toHexString()
              : null,
          ...(status === 'trialing'
            ? { trialEndsAt: current.trialEndsAt, trialUsedAt: record.trialUsedAt ?? now }
            : {}),
        };
        const changed = Object.entries(fields).some(
          ([key, value]) => JSON.stringify(record[key] ?? null) !== JSON.stringify(value ?? null),
        );
        const update = {
          $set: { ...fields, updatedAt: now },
          ...(event ? { $max: { lastEventAt: event.createdAt } } : {}),
        };
        if (changed)
          update.$push = {
            auditOutbox: {
              _id: new ObjectId(),
              spaceId,
              action: 'provider_state_changed',
              provider: config.provider,
              providerSubscriptionId: subscriptionId,
              previousStatus: record.status,
              status,
              source: event?.id ?? 'reconciliation',
              revalidatedOutOfOrder: outOfOrder,
              at: now,
            },
          };
        const result = await subscriptions.updateOne(
          { spaceId, 'billingLease.token': token, 'billingLease.until': { $gt: clock() } },
          update,
        );
        if (!result.matchedCount) throw new Error('Billing lease expired.');
        await flushBillingAudit(database, spaceId);
        // Durable dedupe keys also repair interrupted mail enqueueing on reconciliation.
        if (
          status === 'active' ||
          (status === 'trialing' && +fields.trialEndsAt > +now) ||
          (status === 'canceled' && +fields.currentPeriodEnd > +now)
        )
          await mail(spaceId, subscriptionId, 'welcome', 'first');
        if (status === 'past_due') await mail(spaceId, subscriptionId, 'payment_failed', fields.graceEpisode);
        if (
          status === 'canceled' &&
          +fields.currentPeriodEnd > +now &&
          +fields.currentPeriodEnd <= +now + 3 * day
        )
          await mail(spaceId, subscriptionId, 'ends_soon', fields.currentPeriodEnd.toISOString());
      } finally {
        await subscriptions.updateOne(
          { spaceId, 'billingLease.token': token },
          { $unset: { billingLease: '' } },
        );
      }
    });
  }

  async function processEvents() {
    if (!config.enabled) return;
    const pending = await billingEvents
      .find({ provider: config.provider, doneAt: null, retryAt: { $lte: clock() } })
      .sort({ createdAt: 1 })
      .limit(50)
      .toArray();
    for (const event of pending)
      await leased('event:' + event._id, async () => {
        if ((await billingEvents.findOne({ _id: event._id }))?.doneAt) return;
        try {
          const applied = await sync(event.subscriptionId, event);
          if (!applied) throw new Error('Busy subscription.');
          await billingEvents.updateOne({ _id: event._id }, { $set: { doneAt: clock() } });
        } catch {
          await billingEvents.updateOne(
            { _id: event._id },
            {
              $inc: { attempts: 1 },
              $set: {
                retryAt: new Date(+clock() + Math.min(3600, 5 * 2 ** Math.min(event.attempts, 10)) * 1000),
              },
            },
          );
          console.error('Billing event processing deferred.');
        }
      });
  }

  async function deliverMail() {
    if (!sendMail || !config.enabled) return;
    const jobs = await billingMail
      .find({ sentAt: null, retryAt: { $lte: clock() } })
      .limit(30)
      .toArray();
    for (const job of jobs)
      await leased('mail:' + job._id, async () => {
        if ((await billingMail.findOne({ _id: job._id }))?.sentAt) return;
        const space = await households.findOne({ _id: job.spaceId });
        const owner =
          space &&
          (await accounts.findOne({ _id: space.ownerAccountId, deletionFamilyIds: { $exists: false } }));
        const subscription = await subscriptions.findOne({ spaceId: job.spaceId });
        const stale =
          !subscription ||
          subscription.providerSubscriptionId !== job.providerSubscriptionId ||
          (job.kind === 'payment_failed' &&
            (subscription.status !== 'past_due' || subscription.graceEpisode !== job.episode)) ||
          (job.kind === 'ends_soon' &&
            (subscription.status !== 'canceled' ||
              +subscription.currentPeriodEnd <= +clock() ||
              +subscription.currentPeriodEnd > +clock() + 3 * day)) ||
          (job.kind === 'welcome' && !['active', 'trialing', 'canceled'].includes(subscription.status));
        if (!owner || stale) {
          await billingMail.updateOne({ _id: job._id }, { $set: { sentAt: clock(), skipped: true } });
          return;
        }
        try {
          const link =
            config.publicUrl +
            '/billing/portal/' +
            job.spaceId +
            '?lang=' +
            (owner.appearance?.language ?? 'sl');
          await sendMail({
            to: owner.email,
            ...billingEmail(job.kind, owner.appearance?.language ?? 'sl', link),
            messageId: '<' + Buffer.from(job._id).toString('base64url') + '@billing.sotovor>',
          });
          await billingMail.updateOne({ _id: job._id }, { $set: { sentAt: clock() } });
        } catch {
          await billingMail.updateOne(
            { _id: job._id },
            { $inc: { attempts: 1 }, $set: { retryAt: new Date(+clock() + 60000) } },
          );
          console.error('Billing email delivery deferred.');
        }
      });
  }

  async function reconcile({ force = false } = {}) {
    if (!config.enabled) return false;
    return leased('reconcile:' + config.provider, async () => {
      const today = clock().toISOString().slice(0, 10);
      const state = await billingJobs.findOne({ _id: 'reconcile-day:' + config.provider });
      if (!force && state?.day === today) return;
      const records = subscriptions.find({
        provider: config.provider,
        $or: [
          { plan: { $ne: 'free' } },
          { providerSubscriptionId: { $type: 'string' } },
          { checkoutSessionId: { $type: 'string' } },
        ],
      });
      let failed = false;
      for await (const record of records) {
        try {
          const id =
            (record.checkoutSessionId &&
              (await provider.getCheckoutSubscription?.(record.checkoutSessionId))) ??
            record.providerSubscriptionId;
          if (id && !(await sync(id))) failed = true;
        } catch {
          failed = true;
          console.error('Billing reconciliation deferred for a subscription.');
        }
      }
      if (failed) throw new Error('Some subscriptions could not be reconciled.');
      await billingJobs.updateOne(
        { _id: 'reconcile-day:' + config.provider },
        { $set: { day: today, completedAt: clock() } },
        { upsert: true },
      );
    });
  }

  async function checkout(space, account, plan, locale) {
    if (!config.enabled) throw new HttpError(409, 'Obračunavanje ni omogočeno.', 'BILLING_DISABLED');
    if (config.provider === 'mock' && config.production)
      throw new HttpError(503, 'Obračunavanje trenutno ni na voljo.', 'BILLING_UNAVAILABLE');
    await billing.ensureSubscription(space._id);
    const record = await subscriptions.findOne({ spaceId: space._id });
    // A completed checkout may still be waiting for a missed/delayed webhook.
    // Check the previous hosted session before its reservation can be replaced.
    if (record.checkoutSessionId) {
      const pendingId = await provider.getCheckoutSubscription(record.checkoutSessionId);
      if (pendingId && !terminal(await provider.getSubscription(pendingId))) {
        await sync(pendingId);
        throw new HttpError(409, 'Naročnino že imaš. Uredi jo v portalu.', 'SUBSCRIPTION_EXISTS');
      }
    }
    if (record.providerSubscriptionId && record.provider !== config.provider)
      throw new HttpError(409, 'Naročnino že imaš. Uredi jo v portalu.', 'SUBSCRIPTION_EXISTS');
    if (
      record.providerSubscriptionId &&
      !terminal(await provider.getSubscription(record.providerSubscriptionId))
    )
      throw new HttpError(409, 'Naročnino že imaš. Uredi jo v portalu.', 'SUBSCRIPTION_EXISTS');
    const now = clock(),
      key = new ObjectId().toHexString();
    const claimed = await subscriptions.findOneAndUpdate(
      {
        spaceId: space._id,
        providerSubscriptionId: record.providerSubscriptionId,
        $or: [{ checkoutUntil: { $lte: now } }, { checkoutUntil: { $exists: false } }],
      },
      {
        $set: { provider: config.provider, checkoutKey: key, checkoutUntil: new Date(+now + 32 * 60000) },
        $unset: { checkoutSessionId: '' },
      },
      { returnDocument: 'after' },
    );
    if (!claimed)
      throw new HttpError(409, 'Nakup je že v teku. Uporabi odprto plačilno stran.', 'CHECKOUT_PENDING');
    const session = await provider.createCheckoutSession({
      space: { ...space, providerCustomerId: record.providerCustomerId, checkoutKey: key },
      plan,
      customerEmail: account.email,
      successUrl: config.publicUrl + '/?billing=success&space=' + space._id,
      cancelUrl: config.publicUrl + '/?billing=cancel&space=' + space._id,
      locale,
    });
    const url = URL.parse(session.url ?? '');
    if (
      !url ||
      (config.provider === 'stripe'
        ? url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com'
        : url.origin !== config.publicUrl)
    )
      throw new Error('Invalid checkout URL.');
    await subscriptions.updateOne(
      { spaceId: space._id, checkoutKey: key },
      { $set: { checkoutSessionId: session.id } },
    );
    if (!(await accounts.findOne({ _id: account._id, deletionFamilyIds: { $exists: false } }))) {
      await provider.expireCheckoutSession(session.id);
      const id = await provider.getCheckoutSubscription(session.id);
      if (id) await provider.cancelSubscription(id);
      throw new HttpError(409, 'Izbris računa še ni končan.');
    }
    return { url: session.url };
  }

  async function closeSpaces(ids) {
    for (const spaceId of ids) {
      const record = await subscriptions.findOne({ spaceId });
      if (!record) continue;
      if (record.provider !== config.provider && record.providerSubscriptionId)
        throw new HttpError(503, 'Obračunavanje trenutno ni na voljo.', 'BILLING_UNAVAILABLE');
      if (record.checkoutKey && !record.checkoutSessionId && +record.checkoutUntil > +clock())
        throw new HttpError(
          503,
          'Nakup je že v teku. Poskusi izbris znova čez nekaj minut.',
          'BILLING_DELETE_PENDING',
        );
      const subscriptionsToClose = new Set([record.providerSubscriptionId].filter(Boolean));
      if (record.checkoutSessionId) {
        await provider.expireCheckoutSession(record.checkoutSessionId);
        const id = await provider.getCheckoutSubscription(record.checkoutSessionId);
        if (id) subscriptionsToClose.add(id);
      }
      for (const id of subscriptionsToClose) await provider.cancelSubscription(id);
    }
  }

  async function portal(space, locale = 'sl') {
    if (!config.enabled || (config.provider === 'mock' && config.production))
      throw new HttpError(503, 'Obračunavanje trenutno ni na voljo.', 'BILLING_UNAVAILABLE');
    const record = await subscriptions.findOne({ spaceId: space._id });
    if (!record?.providerCustomerId)
      throw new HttpError(409, 'Plačljive naročnine še nimaš.', 'NO_SUBSCRIPTION');
    const result = await provider.createPortalSession({
      customerId: record.providerCustomerId,
      locale,
      returnUrl: config.publicUrl + '/?space=' + space._id + '#profil',
    });
    const url = URL.parse(result.url ?? '');
    if (
      !url ||
      (config.provider === 'stripe'
        ? url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com'
        : url.origin !== config.publicUrl)
    )
      throw new Error('Invalid portal URL.');
    return { url: result.url };
  }

  function schedule() {
    let stopped = false,
      running = false;
    const tick = async () => {
      if (stopped || running) return;
      running = true;
      try {
        await processEvents();
        await reconcile();
        await deliverMail();
      } catch {
        console.error('Billing maintenance deferred.');
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 5000);
    timer.unref();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
  return {
    config,
    provider,
    enqueue,
    processEvents,
    sync,
    reconcile,
    deliverMail,
    checkout,
    portal,
    schedule,
    closeSpaces,
    now: clock,
  };
}
