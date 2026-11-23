// A redirect is not payment evidence. Only the server's paid subscription state confirms it.
export async function pollPayment(read, { signal, onConfirmed, onTimeout, timeout = 60000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const deadline = setTimeout(() => {
    controller.abort();
    if (!signal?.aborted) onTimeout?.();
  }, timeout);
  let delay = 1000;
  try {
    while (!controller.signal.aborted) {
      try {
        const value = await read(controller.signal);
        if (controller.signal.aborted) return;
        if (
          value?.subscription?.plan?.startsWith('pro_') &&
          value.entitlements?.isPro &&
          ['active', 'trialing', 'canceled'].includes(value.subscription.status)
        ) {
          onConfirmed?.(value);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, delay);
        controller.signal.addEventListener('abort', done, { once: true });
      });
      delay = Math.min(delay * 2, 8000);
    }
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
  }
}
