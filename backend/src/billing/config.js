import { readFileSync } from 'node:fs';

export const stripeApiVersion = '2026-11-18.endive';
export function paymentConfiguration(env = process.env) {
  if ((env.SOTOVOR_BILLING_ENABLED ?? 'false') === 'false') return { enabled: false };
  if (env.SOTOVOR_BILLING_ENABLED !== 'true')
    throw new Error('SOTOVOR_BILLING_ENABLED must be true or false.');
  const provider = env.SOTOVOR_BILLING_PROVIDER;
  if (!['mock', 'stripe'].includes(provider))
    throw new Error('Configure a supported SOTOVOR_BILLING_PROVIDER.');
  const origin = URL.parse(env.SOTOVOR_PUBLIC_URL ?? '');
  if (
    !origin ||
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.href !== origin.origin + '/' ||
    (env.NODE_ENV === 'production' && origin.protocol !== 'https:')
  )
    throw new Error('Billing requires SOTOVOR_PUBLIC_URL to be an absolute origin (HTTPS in production).');
  const secret = env.SOTOVOR_BILLING_WEBHOOK_SECRET;
  if (!secret || secret.length < 16)
    throw new Error('SOTOVOR_BILLING_WEBHOOK_SECRET is required (at least 16 characters).');
  const tax = env.SOTOVOR_STRIPE_AUTOMATIC_TAX ?? 'false';
  if (!['true', 'false'].includes(tax))
    throw new Error('SOTOVOR_STRIPE_AUTOMATIC_TAX must be true or false.');
  const config = {
    enabled: true,
    provider,
    publicUrl: origin.origin,
    secret,
    production: env.NODE_ENV === 'production',
    automaticTax: tax === 'true',
    key: env.SOTOVOR_STRIPE_SECRET_KEY,
    monthly: env.SOTOVOR_STRIPE_PRICE_MONTHLY,
    yearly: env.SOTOVOR_STRIPE_PRICE_YEARLY,
    termsText: env.SOTOVOR_BILLING_TERMS_FILE ? readFileSync(env.SOTOVOR_BILLING_TERMS_FILE, 'utf8') : null,
  };
  if (
    provider === 'stripe' &&
    (!/^sk_(test|live)_/.test(config.key ?? '') ||
      !/^price_/.test(config.monthly ?? '') ||
      !/^price_/.test(config.yearly ?? '') ||
      config.monthly === config.yearly ||
      !secret.startsWith('whsec_'))
  )
    throw new Error(
      'Stripe requires a secret key, distinct monthly/yearly price IDs and a whsec_ webhook secret.',
    );
  if (
    provider === 'stripe' &&
    config.key.startsWith('sk_live_') &&
    (!config.termsText?.trim() || origin.protocol !== 'https:')
  )
    throw new Error('Live Stripe checkout requires HTTPS and a reviewed SOTOVOR_BILLING_TERMS_FILE.');
  return config;
}
