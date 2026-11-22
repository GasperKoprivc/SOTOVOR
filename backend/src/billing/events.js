// Only subscription lifecycle notifications enter the durable queue.
export const lifecycleEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
]);
