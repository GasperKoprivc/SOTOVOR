// Public, non-sensitive configuration for price/feature UI. No provider IDs or keys.
export function registerBillingSite(app, config, payment = {}) {
  app.get(['/api/billing/config', '/api/v1/billing/config'], (_req, res) => {
    res.set('Cache-Control', 'no-store').json(
      config.enabled
        ? {
            enabled: true,
            free: config.free,
            pro: config.pro,
            freeFeatures: config.freeFeatures,
            proFeatures: config.proFeatures,
          }
        : { enabled: false },
    );
  });
  app.get('/api/v1/legal/terms', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ text: payment.termsText ?? null });
  });
}
