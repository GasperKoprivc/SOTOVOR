import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';
import { paymentConfiguration, stripeApiVersion } from '../src/billing/config.js';
import { stripeProvider } from '../src/billing/stripe.js';

const env = {
  SOTOVOR_BILLING_ENABLED: 'true',
  SOTOVOR_BILLING_PROVIDER: 'stripe',
  SOTOVOR_PUBLIC_URL: 'https://sotovor.test',
  SOTOVOR_BILLING_WEBHOOK_SECRET: 'whsec_test_fixture_only',
  SOTOVOR_STRIPE_SECRET_KEY: 'sk_test_fixture',
  SOTOVOR_STRIPE_PRICE_MONTHLY: 'price_monthly',
  SOTOVOR_STRIPE_PRICE_YEARLY: 'price_yearly',
};

test('payment config validates only enabled providers, origin, keys, price IDs and webhook signing secret', () => {
  assert.equal(paymentConfiguration({}).enabled, false);
  assert.equal(
    paymentConfiguration({ SOTOVOR_BILLING_ENABLED: 'false', SOTOVOR_STRIPE_SECRET_KEY: 'bad' }).enabled,
    false,
  );
  assert.equal(paymentConfiguration(env).provider, 'stripe');
  for (const key of [
    'SOTOVOR_BILLING_PROVIDER',
    'SOTOVOR_PUBLIC_URL',
    'SOTOVOR_BILLING_WEBHOOK_SECRET',
    'SOTOVOR_STRIPE_SECRET_KEY',
    'SOTOVOR_STRIPE_PRICE_MONTHLY',
    'SOTOVOR_STRIPE_PRICE_YEARLY',
  ])
    assert.throws(() => paymentConfiguration({ ...env, [key]: '' }));
  assert.throws(() => paymentConfiguration({ ...env, SOTOVOR_BILLING_PROVIDER: 'paddle' }));
  assert.throws(() => paymentConfiguration({ ...env, SOTOVOR_STRIPE_AUTOMATIC_TAX: '1' }));
  assert.throws(() =>
    paymentConfiguration({ ...env, NODE_ENV: 'production', SOTOVOR_PUBLIC_URL: 'http://example.test' }),
  );
  assert.throws(() => paymentConfiguration({ ...env, SOTOVOR_STRIPE_SECRET_KEY: 'sk_live_not_a_real_key' }));
});

test('Stripe checkout uses only configured tax-inclusive EUR prices, consent, metadata, locale and idempotency', async () => {
  const calls = [];
  const config = paymentConfiguration({ ...env, SOTOVOR_STRIPE_AUTOMATIC_TAX: 'true' });
  let exclusive = false;
  const client = {
    prices: {
      retrieve: async (id) => ({
        active: true,
        currency: 'eur',
        unit_amount: id === config.monthly ? 300 : 3000,
        billing_scheme: 'per_unit',
        tax_behavior: exclusive ? 'exclusive' : 'inclusive',
        recurring: { interval: id === config.monthly ? 'month' : 'year', interval_count: 1 },
      }),
    },
    checkout: {
      sessions: {
        create: async (...args) => {
          calls.push(args);
          return { id: 'cs_test', url: 'https://checkout.stripe.com/test' };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (args) => {
          calls.push(args);
          return { url: 'https://billing.stripe.com/test' };
        },
      },
    },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_paid',
        customer: 'cus_one',
        status: 'active',
        metadata: { spaceId: 'a'.repeat(24), plan: 'monthly' },
        cancel_at_period_end: true,
        items: { data: [{ quantity: 1, price: { id: config.yearly }, current_period_end: 1900000000 }] },
      }),
    },
  };
  const provider = stripeProvider(config, client);
  await provider.validate();
  exclusive = true;
  await assert.rejects(provider.validate());
  await provider.createCheckoutSession({
    space: { _id: 'a'.repeat(24), checkoutKey: 'unique-checkout' },
    plan: 'yearly',
    customerEmail: 'test@example.invalid',
    successUrl: config.publicUrl + '/ok',
    cancelUrl: config.publicUrl + '/cancel',
    locale: 'de',
  });
  const [args, options] = calls[0];
  assert.equal(args.mode, 'subscription');
  assert.equal(args.line_items[0].price, config.yearly);
  assert.equal(args.client_reference_id, 'a'.repeat(24));
  assert.deepEqual(args.subscription_data.metadata, { spaceId: 'a'.repeat(24), plan: 'yearly' });
  assert.equal(args.locale, 'de');
  assert.equal(args.automatic_tax.enabled, true);
  assert.equal(args.consent_collection.terms_of_service, 'required');
  assert.match(args.custom_text.terms_of_service_acceptance.message, /sofortigen Beginn.*Widerrufsregeln/);
  assert.match(args.custom_text.terms_of_service_acceptance.message, /\/pogoji/);
  assert.equal(options.idempotencyKey, 'unique-checkout');
  await provider.createPortalSession({ customerId: 'cus_one', returnUrl: config.publicUrl });
  assert.equal(calls[1].customer, 'cus_one');
  // Portal price changes do not update Stripe metadata; derive the current plan from the actual price.
  assert.equal((await provider.getSubscription('sub_paid')).plan, 'yearly');
  assert.equal(stripeApiVersion, '2026-11-18.endive');
});

test('official Stripe SDK verifies raw signatures and normalizes current invoice subscription references', () => {
  const config = paymentConfiguration(env);
  const sdk = new Stripe(config.key, { apiVersion: stripeApiVersion });
  const provider = stripeProvider(config, sdk);
  const payload = JSON.stringify({
    id: 'evt_one',
    type: 'invoice.payment_failed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        parent: { subscription_details: { subscription: 'sub_one' } },
        customer_email: 'never-store@example.invalid',
      },
    },
  });
  const header = sdk.webhooks.generateTestHeaderString({ payload, secret: config.secret });
  const event = provider.verifyAndParseWebhook(Buffer.from(payload), { 'stripe-signature': header });
  assert.equal(event.subscriptionId, 'sub_one');
  assert.equal(JSON.stringify(event).includes('customer_email'), false);
  assert.throws(() =>
    provider.verifyAndParseWebhook(Buffer.from(payload + ' '), { 'stripe-signature': header }),
  );
  assert.throws(() =>
    provider.verifyAndParseWebhook(Buffer.from(payload), { 'stripe-signature': 'invalid' }),
  );
});
