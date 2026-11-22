import Stripe from 'stripe';
import { stripeApiVersion } from './config.js';
import { consent, languageOf } from './text.js';

const idOf = (value) => (typeof value === 'string' ? value : value?.id);
export function stripeProvider(
  config,
  client = new Stripe(config.key, { apiVersion: stripeApiVersion, timeout: 10000, maxNetworkRetries: 1 }),
) {
  function normalize(sub) {
    const item = sub.items?.data?.[0];
    const price = idOf(item?.price);
    const plan = price === config.monthly ? 'monthly' : price === config.yearly ? 'yearly' : null;
    if (
      !plan ||
      sub.items.data.length !== 1 ||
      item.quantity !== 1 ||
      !/^[a-f0-9]{24}$/.test(sub.metadata?.spaceId ?? '')
    )
      throw new Error('Unrecognized billing subscription.');
    return {
      id: sub.id,
      customerId: idOf(sub.customer),
      spaceId: sub.metadata.spaceId,
      plan,
      status: sub.status,
      currentPeriodEnd: new Date((item.current_period_end ?? sub.current_period_end) * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    };
  }
  return {
    async validate() {
      for (const [priceId, amount, interval] of [
        [config.monthly, 300, 'month'],
        [config.yearly, 3000, 'year'],
      ]) {
        const price = await client.prices.retrieve(priceId);
        if (
          !price.active ||
          price.currency !== 'eur' ||
          price.unit_amount !== amount ||
          price.tax_behavior !== 'inclusive' ||
          price.recurring?.interval !== interval ||
          price.recurring.interval_count !== 1 ||
          price.billing_scheme !== 'per_unit'
        )
          throw new Error(
            'Stripe prices must be active, EUR 3/month or EUR 30/year, tax-inclusive and recurring.',
          );
      }
    },
    async createCheckoutSession({ space, plan, successUrl, cancelUrl, customerEmail, locale }) {
      const lang = languageOf(locale);
      const metadata = { spaceId: String(space._id), plan };
      return client.checkout.sessions.create(
        {
          mode: 'subscription',
          ui_mode: 'hosted',
          client_reference_id: String(space._id),
          metadata,
          subscription_data: { metadata },
          line_items: [{ price: plan === 'monthly' ? config.monthly : config.yearly, quantity: 1 }],
          ...(space.providerCustomerId
            ? { customer: space.providerCustomerId }
            : { customer_email: customerEmail }),
          success_url: successUrl,
          cancel_url: cancelUrl,
          locale: lang,
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
          automatic_tax: { enabled: config.automaticTax },
          consent_collection: { terms_of_service: 'required' },
          custom_text: {
            terms_of_service_acceptance: {
              message:
                consent[lang] +
                ' [' +
                { sl: 'Pogoji', en: 'Terms', de: 'Bedingungen' }[lang] +
                '](' +
                config.publicUrl +
                '/pogoji?lang=' +
                lang +
                ')',
            },
          },
        },
        { idempotencyKey: space.checkoutKey },
      );
    },
    createPortalSession: ({ customerId, returnUrl }) =>
      client.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl }),
    verifyAndParseWebhook(rawBody, headers) {
      const event = client.webhooks.constructEvent(rawBody, headers['stripe-signature'], config.secret, 300);
      const object = event.data.object;
      let subscriptionId;
      if (event.type.startsWith('customer.subscription.')) subscriptionId = object.id;
      else if (event.type === 'checkout.session.completed') subscriptionId = idOf(object.subscription);
      else if (['invoice.payment_failed', 'invoice.paid', 'invoice.payment_succeeded'].includes(event.type))
        subscriptionId = idOf(object.parent?.subscription_details?.subscription ?? object.subscription);
      if (!subscriptionId) return null;
      return {
        id: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
        subscriptionId,
        spaceId: object.metadata?.spaceId ?? object.parent?.subscription_details?.metadata?.spaceId ?? null,
      };
    },
    async getSubscription(id) {
      try {
        return normalize(await client.subscriptions.retrieve(id));
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw error;
      }
    },
    async getCheckoutSubscription(id) {
      return idOf((await client.checkout.sessions.retrieve(id)).subscription);
    },
    async expireCheckoutSession(id) {
      try {
        await client.checkout.sessions.expire(id);
      } catch (error) {
        if (error.statusCode !== 400 && error.statusCode !== 404) throw error;
      }
    },
    async cancelSubscription(id) {
      try {
        await client.subscriptions.cancel(id, { invoice_now: false, prorate: false });
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }
    },
  };
}
