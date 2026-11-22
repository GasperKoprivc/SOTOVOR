import { lifecycleEvents } from './events.js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function mockProvider(database, config, clock = () => new Date()) {
  const records = database.mockBilling;
  return {
    async createCheckoutSession({ space, plan, successUrl, cancelUrl, locale }) {
      const id = 'mock_cs_' + randomBytes(24).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      const result = await records.findOneAndUpdate(
        { _id: space.checkoutKey },
        {
          $setOnInsert: {
            id,
            kind: 'checkout',
            spaceId: String(space._id),
            plan,
            customerId: space.providerCustomerId || 'mock_cus_' + randomBytes(12).toString('hex'),
            successUrl,
            cancelUrl,
            locale,
            csrf,
            status: 'open',
            expiresAt: new Date(+clock() + 31 * 60000),
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return { id: result.id, url: config.publicUrl + '/dev/mock-checkout?session=' + result.id };
    },
    async createPortalSession({ customerId, returnUrl, locale }) {
      const id = randomBytes(24).toString('hex');
      await records.insertOne({ _id: 'portal:' + id, kind: 'portal', customerId, returnUrl, locale });
      return { url: config.publicUrl + '/dev/mock-checkout?portal=' + id };
    },
    verifyAndParseWebhook(rawBody, headers) {
      const signature = headers['x-sotovor-signature'];
      if (!/^\d+:[a-f0-9]{64}$/.test(signature ?? '')) throw new Error('Invalid signature.');
      const [time, hash] = signature.split(':');
      if (Math.abs(+clock() - Number(time)) > 300000) throw new Error('Expired signature.');
      const expected = createHmac('sha256', config.secret)
        .update(time + '.')
        .update(rawBody)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new Error('Invalid signature.');
      const event = JSON.parse(rawBody);
      if (
        typeof event.id !== 'string' ||
        !event.id ||
        event.id.length > 200 ||
        typeof event.type !== 'string' ||
        !/^mock_sub_[a-f0-9]+$/.test(event.subscriptionId ?? '') ||
        !Number.isFinite(Date.parse(event.createdAt))
      )
        throw new Error('Invalid event.');
      if (!lifecycleEvents.has(event.type)) return null;
      return {
        id: event.id,
        type: event.type,
        createdAt: new Date(event.createdAt),
        subscriptionId: event.subscriptionId,
        spaceId: null,
      };
    },
    async getSubscription(id) {
      const sub = await records.findOne({ _id: id, kind: 'subscription' });
      if (!sub) return null;
      return {
        id: sub._id,
        spaceId: sub.spaceId,
        customerId: sub.customerId,
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        trialEndsAt: sub.trialEndsAt,
      };
    },
    async setSubscription(value) {
      const { id, ...fields } = value;
      await records.updateOne({ _id: id }, { $set: { ...fields, kind: 'subscription' } }, { upsert: true });
    },
    async getCheckoutSubscription(id) {
      return (await records.findOne({ id, kind: 'checkout' }))?.subscriptionId ?? null;
    },
    async expireCheckoutSession(id) {
      await records.updateOne({ id, kind: 'checkout', status: 'open' }, { $set: { status: 'expired' } });
    },
    async cancelSubscription(id) {
      await records.updateOne({ _id: id }, { $set: { status: 'canceled', cancelAtPeriodEnd: false } });
    },
    sign(event) {
      const raw = Buffer.from(JSON.stringify(event));
      const time = String(+clock());
      return {
        raw,
        headers: {
          'x-sotovor-signature':
            time +
            ':' +
            createHmac('sha256', config.secret)
              .update(time + '.')
              .update(raw)
              .digest('hex'),
        },
      };
    },
  };
}
