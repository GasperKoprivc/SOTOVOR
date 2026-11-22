import { raw, urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../api-errors.js';
import { consent, labels, languageOf } from './text.js';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function page(language, title, body) {
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><link rel="stylesheet" href="/billing-pages.css"><main><a href="/" class="brand">SOTOVOR.</a><h1>${escape(title)}</h1>${body}</main></html>`;
}

export function registerPaymentEndpoints(router, scope, runtime) {
  if (!runtime?.config.enabled) return;
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'Preveč poskusov. Poskusi pozneje.', 'BILLING_RATE_LIMIT')),
  });
  const protect = (req) => {
    if (req.get('origin') && req.get('origin') !== runtime.config.publicUrl)
      throw new HttpError(403, 'Zahteva ni dovoljena.', 'forbidden');
  };
  const requestLanguage = (req) =>
    languageOf(
      req.get('accept-language')
        ? req.acceptsLanguages('sl', 'en', 'de')
        : (req.account.appearance?.language ?? 'sl'),
    );
  router.post('/spaces/:id/billing/checkout', limiter, async (req, res) => {
    protect(req);
    const { space, admin } = await scope(req);
    if (!admin) throw new HttpError(403, 'To lahko opravi samo skrbnik prostora.');
    if (!req.body || Object.keys(req.body).length !== 1 || !['monthly', 'yearly'].includes(req.body.plan))
      throw new HttpError(
        400,
        'Izberi mesečni ali letni paket brez dodatnih podatkov o ceni.',
        'INVALID_BILLING_PLAN',
      );
    try {
      res.json(await runtime.checkout(space, req.account, req.body.plan, requestLanguage(req)));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'Obračunavanje trenutno ni na voljo.', 'BILLING_UNAVAILABLE');
    }
  });
  router.post('/spaces/:id/billing/portal', limiter, async (req, res) => {
    protect(req);
    const { space, admin } = await scope(req);
    if (!admin) throw new HttpError(403, 'To lahko opravi samo skrbnik prostora.');
    if (Object.keys(req.body ?? {}).length)
      throw new HttpError(400, 'Pošlji prazen objekt.', 'BILLING_INVALID_REQUEST');
    try {
      res.json(await runtime.portal(space, requestLanguage(req)));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'Obračunavanje trenutno ni na voljo.', 'BILLING_UNAVAILABLE');
    }
  });
}

export function registerBillingPublic(app, runtime, database) {
  if (!runtime?.config.enabled) return;
  const { config, provider } = runtime;
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  app.post(
    '/webhooks/billing/:provider',
    limiter,
    raw({ type: 'application/json', limit: '256kb', inflate: false }),
    async (req, res) => {
      if (req.params.provider !== config.provider || !Buffer.isBuffer(req.body)) return res.sendStatus(400);
      let event;
      try {
        event = provider.verifyAndParseWebhook(req.body, req.headers);
      } catch {
        return res
          .status(400)
          .json({ error: { code: 'invalid_signature', message: 'Invalid billing signature.' } });
      }
      try {
        await runtime.enqueue(event);
        res.status(202).json({ received: true });
      } catch {
        res.status(503).json({ error: { code: 'unavailable', message: 'Billing intake unavailable.' } });
      }
    },
  );

  app.get('/pogoji', (req, res) => {
    const lang = languageOf(req.query.lang);
    const copy = labels[lang];
    const draft = {
      sl: 'Osnutek za testiranje. Pred pravimi plačili mora pogoje pregledati in dopolniti upravljavec. Sotovor Pro: 3 EUR/mesec ali 30 EUR/leto z DDV. Naročnina velja za družinski prostor. Odpoved se uredi v portalu. Iztek naročnine ne izbriše vaših podatkov. Pravila odstopa, podatke upravljavca, kontakt, veljavno pravo in politiko vračil mora dopolniti upravljavec.',
      en: 'Testing draft. The operator must review and complete the terms before live payments. Sotovor Pro: EUR 3/month or EUR 30/year including VAT, per family space. Cancellation is managed in the portal. Subscription expiry does not delete your data. The operator must supply withdrawal rules, business identity, contact details, applicable law and refund policy.',
      de: 'Testentwurf. Vor echten Zahlungen muss der Betreiber die Bedingungen prüfen und vervollständigen. Sotovor Pro: 3 EUR/Monat oder 30 EUR/Jahr einschließlich MwSt., je Familienbereich. Die Kündigung erfolgt im Portal. Beim Ablauf werden eure Daten nicht gelöscht. Widerrufsregeln, Anbieterangaben, Kontakt, anwendbares Recht und Erstattungsregeln muss der Betreiber ergänzen.',
    };
    res
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(page(lang, copy.terms, '<p class="terms">' + escape(config.termsText ?? draft[lang]) + '</p>'));
  });

  app.get('/billing/portal/:id', (req, res) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.sendStatus(404);
    const lang = languageOf(req.query.lang),
      text = labels[lang];
    const prompt = {
      sl: 'Najprej se prijavi v Sotovor, nato odpri portal naročnine.',
      en: 'Sign in to Sotovor, then open the subscription portal.',
      de: 'Melde dich bei Sotovor an und öffne dann das Abonnementportal.',
    };
    res
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(
        page(
          lang,
          'Sotovor Pro',
          `<p>${escape(prompt[lang])}</p><a href="/">${escape(text.title)}</a><button id="portal" data-space="${req.params.id}">${escape(text.openPortal)}</button><p role="alert" id="problem"></p><script src="/billing-portal.js" defer></script>`,
        ),
      );
  });

  if (config.provider !== 'mock' || config.production) return;
  app.get('/dev/mock-checkout', async (req, res) => {
    const portal =
      typeof req.query.portal === 'string'
        ? await database.mockBilling.findOne({ _id: 'portal:' + req.query.portal, kind: 'portal' })
        : null;
    if (portal) {
      const lang = languageOf(portal.locale),
        text = labels[lang];
      return res
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(
          page(
            lang,
            text.portal,
            '<p>' +
              escape(text.test) +
              '</p><a href="' +
              escape(portal.returnUrl) +
              '">' +
              escape(text.back) +
              '</a>',
          ),
        );
    }
    const record =
      typeof req.query.session === 'string'
        ? await database.mockBilling.findOne({ id: req.query.session, kind: 'checkout' })
        : null;
    if (!record || record.status !== 'open' || +record.expiresAt <= +runtime.now())
      return res.sendStatus(404);
    const lang = languageOf(record.locale),
      text = labels[lang];
    res
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(
        page(
          lang,
          text.title,
          `<p>${escape(text.test)}</p><p>${escape(text[record.plan])}</p><form method="post" action="/dev/mock-checkout"><input type="hidden" name="session" value="${escape(record.id)}"><input type="hidden" name="csrf" value="${escape(record.csrf)}"><label><input type="checkbox" name="consent" value="yes" required>${escape(consent[lang])}</label><a href="/pogoji?lang=${lang}">${escape(text.terms)}</a><button>${escape(text.complete)}</button></form><a href="${escape(record.cancelUrl)}">${escape(text.cancel)}</a>`,
        ),
      );
  });
  app.post('/dev/mock-checkout', limiter, urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
    if (req.get('origin') && req.get('origin') !== config.publicUrl) return res.sendStatus(403);
    const record = await database.mockBilling.findOne({ kind: 'checkout', id: req.body.session });
    if (
      !record ||
      record.csrf !== req.body.csrf ||
      req.body.consent !== 'yes' ||
      +record.expiresAt <= +runtime.now() ||
      !['open', 'complete'].includes(record.status)
    )
      return res.sendStatus(400);
    const id = 'mock_sub_' + record.id.slice(8);
    await database.mockBilling.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          kind: 'subscription',
          spaceId: record.spaceId,
          customerId: record.customerId,
          plan: record.plan,
          status: 'active',
          currentPeriodEnd: new Date(+runtime.now() + (record.plan === 'monthly' ? 30 : 365) * 86400_000),
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
        },
      },
      { upsert: true },
    );
    await database.mockBilling.updateOne(
      { _id: record._id },
      { $set: { status: 'complete', subscriptionId: id, consentAt: runtime.now() } },
    );
    // Exercise the same signature verifier as a real provider; redirects never write entitlements.
    const signed = provider.sign({
      id: 'mock_complete_' + record.id,
      type: 'checkout.session.completed',
      subscriptionId: id,
      createdAt: runtime.now().toISOString(),
    });
    await runtime.enqueue(provider.verifyAndParseWebhook(signed.raw, signed.headers));
    res.redirect(303, record.successUrl);
  });
}
