import { HttpError } from './api-errors.js';

export const planMessage = 'Za to možnost potrebuješ Sotovor Pro.';
export const defaultBillingConfig = Object.freeze({
  enabled: false,
  provider: 'mock',
  free: { members: 5, planningProposals: 2, shoppingLists: 1, voiceNotes: 20 },
  pro: { members: 12, planningProposals: null, shoppingLists: null, voiceNotes: null },
  freeFeatures: {
    whatsapp: false,
    ics: false,
    transcription: false,
    allTimeStatistics: false,
    rewards: false,
  },
  proFeatures: { whatsapp: true, ics: true, transcription: true, allTimeStatistics: true, rewards: true },
});

const envName = (name) => name.replace(/[A-Z]/g, (letter) => '_' + letter).toUpperCase();
export function billingConfiguration(env = process.env) {
  const enabled = env.SOTOVOR_BILLING_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('SOTOVOR_BILLING_ENABLED must be true or false.');
  if (enabled === 'false') return { ...defaultBillingConfig, enabled: false };
  const provider = env.SOTOVOR_BILLING_PROVIDER || 'mock';
  if (!['mock', 'stripe'].includes(provider)) throw new Error('Unsupported billing provider.');
  const config = { enabled: true, provider };
  for (const tier of ['free', 'pro']) {
    config[tier] = {};
    config[tier + 'Features'] = {};
    for (const [name, fallback] of Object.entries(defaultBillingConfig[tier])) {
      const key = `SOTOVOR_LIMIT_${tier.toUpperCase()}_${envName(name)}`;
      const value = env[key];
      if (value == null) config[tier][name] = fallback;
      else if (value === 'unlimited') config[tier][name] = null;
      else if (/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)))
        config[tier][name] = Number(value);
      else throw new Error(`${key} must be a nonnegative integer or unlimited.`);
    }
    for (const [name, fallback] of Object.entries(defaultBillingConfig[tier + 'Features'])) {
      const key = `SOTOVOR_LIMIT_${tier.toUpperCase()}_${envName(name)}`;
      const value = env[key];
      if (value != null && !['true', 'false'].includes(value))
        throw new Error(`${key} must be true or false.`);
      config[tier + 'Features'][name] = value == null ? fallback : value === 'true';
    }
  }
  return config;
}

// Pure: the caller supplies both the clock and the configuration; no DB or environment access.
export function getEntitlements(_space, subscription, now, config = defaultBillingConfig) {
  const future = (value) => value != null && new Date(value).getTime() > new Date(now).getTime();
  let reason = 'free';
  if (!config.enabled) reason = 'billing_disabled';
  else if (future(subscription?.manualGrantUntil)) reason = 'manual_grant';
  else if (subscription?.status === 'trialing' && future(subscription.trialEndsAt)) reason = 'trial';
  else if (subscription?.status === 'active') reason = 'active';
  else if (subscription?.status === 'past_due' && future(subscription.graceUntil)) reason = 'grace';
  else if (subscription?.status === 'canceled' && future(subscription.currentPeriodEnd))
    reason = 'canceled_period';
  const isPro = reason !== 'free';
  const disabled = reason === 'billing_disabled';
  return {
    isPro,
    reason,
    limits: disabled
      ? Object.fromEntries(Object.keys(config.pro).map((name) => [name, null]))
      : { ...(isPro ? config.pro : config.free) },
    features: disabled
      ? Object.fromEntries(Object.keys(config.proFeatures).map((name) => [name, true]))
      : { ...(isPro ? config.proFeatures : config.freeFeatures) },
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  };
}

export function planRequired(spaceId, feature, limit = null, current = null) {
  const error = new HttpError(403, planMessage, 'PLAN_REQUIRED');
  error.details = { feature, limit, current, upgradeUrl: '/?space=' + spaceId + '#profil' };
  return error;
}

export function assertLimit(name, currentCount, entitlements, spaceId) {
  const limit = entitlements.limits[name];
  if (limit !== null && currentCount >= limit) throw planRequired(spaceId, name, limit, currentCount);
}

export function requireFeature(name) {
  return async (req, _res, next) => {
    try {
      await req.billing.assertFeature(req.household, name);
      next();
    } catch (error) {
      next(error);
    }
  };
}
