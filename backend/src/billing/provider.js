import { stripeProvider } from './stripe.js';
import { mockProvider } from './mock.js';

// Shared interface: createCheckoutSession, createPortalSession,
// verifyAndParseWebhook (normalized IDs/timestamps only), getSubscription.
export async function createProvider(database, config, options = {}) {
  if (!config.enabled) return null;
  const provider =
    config.provider === 'stripe'
      ? stripeProvider(config, options.stripeClient)
      : mockProvider(database, config, options.clock);
  try {
    await provider.validate?.();
  } catch {
    throw new Error('Billing provider configuration could not be validated.');
  }
  return provider;
}
