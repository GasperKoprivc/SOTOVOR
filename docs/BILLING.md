# Sotovor Pro: P2 billing

P2 implements the payment core. P3 will supply subscription-management screens
in web/Tauri and Android. Until then an admin can exercise the documented API.
Default `SOTOVOR_BILLING_ENABLED=false` keeps every feature unlocked, hides billing
UI and makes no provider calls. Enabling it activates the P1 plan limits.
No production Stripe account, products, keys or webhook have been created by this
change. All prices are per family space: **EUR 3/month or EUR 30/year, VAT included**.

## Configuration

Copy the billing entries from `.env.example` (local) or
`.env.production.example` (VPS). Never commit the filled file.

| Variable                         | Meaning when billing is enabled                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `SOTOVOR_BILLING_ENABLED`        | Strict `true` / `false`; default `false`                                                     |
| `SOTOVOR_BILLING_PROVIDER`       | `mock` or `stripe`; explicit choice required                                                 |
| `SOTOVOR_PUBLIC_URL`             | Exact site origin without a path; HTTPS in production                                        |
| `SOTOVOR_BILLING_WEBHOOK_SECRET` | Random secret of at least 16 characters for mock; Stripe endpoint/CLI `whsec_...` for Stripe |
| `SOTOVOR_STRIPE_SECRET_KEY`      | Stripe secret `sk_test_...` first; server only                                               |
| `SOTOVOR_STRIPE_PRICE_MONTHLY`   | Active recurring EUR 300-cent monthly price, quantity 1, tax inclusive                       |
| `SOTOVOR_STRIPE_PRICE_YEARLY`    | Distinct active recurring EUR 3000-cent yearly price, tax inclusive                          |
| `SOTOVOR_STRIPE_AUTOMATIC_TAX`   | Strict `true` / `false`, default `false`; enable only after configuring Stripe Tax           |
| `SOTOVOR_BILLING_TERMS_FILE`     | UTF-8 human-reviewed text rendered at `/pogoji`; mandatory for live keys                     |

Enabled billing fails startup on missing/invalid settings. Stripe additionally
checks the actual price objects before listening: currency, amount, interval,
interval count, tax behavior and billing scheme must match. Official `stripe`
SDK is pinned to **23.2.0**, API **2026-11-18.endive**. SDK upgrades require
reviewing normalization/signature tests and Stripe's changelog together.

Compose forwards the same settings. For reviewed legal copy create
`legal/pogoji.txt` on the host and set
`SOTOVOR_BILLING_TERMS_FILE=/app/legal/pogoji.txt`. Both Compose definitions
mount `./legal` read-only at `/app/legal`; the directory is ignored by Git.
Make the file readable by the container's non-root `node` user (it contains
public text, not credentials). With `start.bat` use its actual Windows path.
Blank path permits only the clearly marked testing draft with test keys.

Do not use live keys until the operator has completed [human tasks](HUMAN_TASKS.md#sotovor-pro-p2-stripe-setup).
Supplying a file does not establish legal compliance. The immediate-service
checkbox acknowledges withdrawal rules; it is **not** a blanket assertion that
all statutory withdrawal rights automatically disappear. A qualified human
must review identity/contact, recurring prices, cancellation, refunds and
withdrawal information, and the exact consent wording before publication.
The supplied terms file is served as-is in all locales; provide an appropriate
multilingual document. Draft terms, checkout consent and service emails support
Slovenian, English and German.

## Local mock checkout (no money)

Use a separate development database and normal admin account. In a private
local `.env`, enable mock, set `SOTOVOR_PUBLIC_URL=http://127.0.0.1:3000`,
and generate a random webhook secret, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
.\start.bat
```

Use that **same origin** in the browser. For development `NODE_ENV` must not be
`production`. The normal Docker image defaults to production and intentionally
has **no** mock checkout page; use `start.bat`, or an isolated Compose override
with `NODE_ENV=test`/`development` for mock testing. Never enable mock on the public
production service. Production mock checkout/portal requests return 503.

Sign in, create/select a family, and get `household.id` from
`GET /api/v1/dashboard` (or the selected space in the app). In the signed-in
browser console, replacing the example ID:

```javascript
const spaceId = 'REPLACE_WITH_YOUR_SPACE_ID';
const response = await fetch(`/api/v1/spaces/${spaceId}/billing/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en' },
  body: JSON.stringify({ plan: 'monthly' }), // or yearly; never send amounts
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
location.assign(result.url);
```

Tick the required consent box and complete the fake form. Redirect alone never
activates Pro; the signed event is queued, verified and applied by the worker
within about five seconds. Read `GET /api/v1/spaces/<id>/billing` to inspect status.
A second checkout is blocked while the first is pending (32 minutes) or a
nonterminal provider subscription exists. An abandoned remote session expires
after 31 minutes. A provider timeout may leave a pending reservation until its
32-minute expiry; reconciliation recovers a completed session automatically.

Script state changes in a second terminal against **that same DB and env file**:

```powershell
node scripts/billing-mock.js <spaceId> past_due
node scripts/billing-mock.js <spaceId> active
node scripts/billing-mock.js <spaceId> cancel 2
node scripts/billing-mock.js <spaceId> expired
node scripts/billing-reconcile.js
```

`cancel 2` means cancel at the end of a period two days from now, so it also
exercises the ends-soon message. These commands alter only the mock provider;
no card or live provider is involved. They refuse production. Trial is still
`POST /api/v1/spaces/<id>/billing/trial` with `{}`; once per space, 14 days,
no card. Buying during a trial is allowed, but starting another local trial
cannot overwrite a live paid subscription.

For messages, use the existing configured SMTP transport. In local development
without SMTP, mail jobs remain queued. Automated integration tests capture all
three templates in SL/EN/DE; the disposable test stack can use its Mailpit sink.
Never enable `SOTOVOR_TEST_MAIL_SINK` outside that isolated test environment.
Receipts and invoices are sent by the provider, not by the service mailer.

Portal creation (admin only) uses POST with `{}` to the matching
`/billing/portal` endpoint. Email links go to `/billing/portal/<spaceId>?lang=en`;
sign in first, then press its button. That public handoff page is not an auth
capability: only the normal authenticated admin POST can issue a portal URL.

## Stripe TEST mode: manual end-to-end checklist

A human performs these steps with their own Stripe test account. No test-mode
end-to-end run against Stripe has been claimed by the automated mock tests.
Use only test keys and Stripe-hosted forms, never real card details.

1. Install the [official Stripe CLI](https://docs.stripe.com/stripe-cli),
   run `stripe login`, and select the correct test/sandbox account. In the
   Stripe Dashboard enable test mode. Create the Sotovor Pro product and the
   two inclusive EUR recurring prices, or use the authenticated CLI:

   ```bash
   stripe products create --name="Sotovor Pro"
   # Substitute prod_... returned above in BOTH commands; retain price_... IDs.
   stripe prices create --product=prod_REPLACE --currency=eur --unit-amount=300 --tax-behavior=inclusive -d 'recurring[interval]=month'
   stripe prices create --product=prod_REPLACE --currency=eur --unit-amount=3000 --tax-behavior=inclusive -d 'recurring[interval]=year'
   ```

2. Configure the test Customer Portal in the Dashboard: invoices, payment-method
   updates, cancellation **at period end**, and only these two price options
   for plan changes. Do not permit arbitrary products or multiple quantities.
   Configure the business terms URL to the future `/pogoji` page, and review
   the custom consent text. Configure provider receipt emails. Set Automatic
   Tax to `false` unless the account/tax registrations are ready and tested.
3. Start forwarding before starting the app:

   ```bash
   stripe listen --forward-to http://127.0.0.1:3000/webhooks/billing/stripe --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed,invoice.paid,invoice.payment_succeeded
   ```

   Privately put its displayed `whsec_...`, a matching `sk_test_...`, the two
   price IDs and `SOTOVOR_BILLING_PROVIDER=stripe` in `.env`. Keep billing
   enabled and the exact local public origin. Restart the app. A Dashboard
   endpoint secret differs from the CLI secret; never interchange them.

4. Use the admin checkout request above. Verify EUR 3/month or EUR 30/year,
   selected language, the terms link and mandatory immediate-service consent.
   Test payment with Stripe's documented `4242 4242 4242 4242` **test card on
   Stripe's checkout page only**, future expiry and test CVC. Verify webhook
   delivery 202, then server status active and exactly one welcome message.
   Opening the success URL without payment must not activate anything.
5. Try a second checkout and a member's checkout: expect 409 and 403. Create a
   portal session; inspect invoices, change to yearly, update payment method,
   then schedule cancellation. Pro remains usable through paid-through time.
   Confirm plan changes derive from the actual price, not stale metadata.
6. Use Stripe test clocks and documented test payment methods to simulate a
   **renewal** failure, recovery, and end-of-period cancellation on this
   app-created subscription. Failed renewal must produce past_due with one
   seven-day grace interval; repeated failures cannot extend it. Recover to
   active; cancellation remains paid-through; deletion becomes expired.
   A generic `stripe trigger invoice.payment_failed` creates unrelated
   fixtures and does not prove this family's lifecycle. Test clocks may
   require a test customer created with the clock in the Dashboard.
7. Resend the same signed event with the Dashboard/CLI (for a registered test
   endpoint: `stripe events resend evt_REPLACE --webhook-endpoint=we_REPLACE`).
   Verify one `billing_events` receipt and no duplicate audit/email. Deliver
   an older failure after recovery: canonical provider state must stay active.
   CLI forwarding must be running for local deliveries.
8. Temporarily stop forwarding, change this subscription in the Dashboard,
   then run `node scripts/billing-reconcile.js`. Verify drift repair without
   duplicate welcome messages. Send invalid signatures with curl: expect 400
   and no state changes. Stop the listener when finished.
9. For public test deployment, register
   `https://YOUR_DOMAIN/webhooks/billing/stripe` in the Dashboard with the same
   listed event types and pinned API version; put **that endpoint's secret**
   into the VPS private `.env`, then recreate app. Verify SMTP delivery and
   the portal email handoff from another browser. Do not switch to live
   until all human reviews and this checklist pass.

Stripe references: [Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create),
[webhook signatures and retries](https://docs.stripe.com/webhooks),
[test payments](https://docs.stripe.com/testing),
[test clocks](https://docs.stripe.com/billing/testing/test-clocks).

## State, security and operations

- Provider methods are isolated in `backend/src/billing/provider.js`, `mock.js`
  and `stripe.js`. Checkout/portal may receive a locale in addition to the core
  interface. Internal expire/lookup/cancel operations prevent orphan billing
  during account deletion and recover checkout without a delivered webhook.
- Active/trialing map to Pro; past_due/unpaid map to seven-day grace, preserved
  across repeated failures. Recovery clears grace. `cancel_at_period_end` maps
  active/trialing to canceled, still paid-through; it cannot extend past_due.
  Deleted/unsupported subscriptions map to expired. No downgrade deletes data.
- Webhooks are raw, 256 KiB max, 240/minute/IP, signature-gated, outside Origin
  and CSRF checks. A unique `(provider,id)` receipt is written before 202.
  Unsupported signed events are acknowledged and ignored. Processing is async;
  provider and DB outages remain retryable rather than falsely acknowledged
  as processed. Never log provider error objects or raw webhook payloads.
- Workers always re-fetch canonical subscriptions; timestamps are compared
  with monotonic `lastEventAt`. Old payloads cannot restore old states.
  Subscription/customer/space bindings and actual configured prices are
  checked; unexpected bindings fail closed. Customers are unique per space,
  avoiding another family's invoice exposure through the portal.
- Every state transition writes the durable audit outbox and `billing_audit`.
  Only provider IDs, normalized state/dates and operational dedupe/lease data
  are retained, not card details, address, raw invoice or webhook payloads.
  Existing account email is resolved only when sending service mail.
- On startup and every daily UTC cycle, reconciliation fetches non-free,
  known-subscription and pending-checkout records. It repairs missed events
  and queues reminders within three days of a canceled paid-through date.
  Multiple instances use Mongo leases plus per-subscription fencing tokens.
  Expired jobs recover after a crash. SMTP uses a durable deduplicated outbox
  with stable Message-ID; a crash after SMTP accepts mail but before DB ack
  can still cause a duplicate (at-least-once transport, not exactly-once).
- Account deletion cancels owned provider subscriptions and expires pending
  checkout before deleting family records. Provider outages pause deletion
  for retry. Deleting an ordinary member does not cancel the family's plan.
- Feature-flag disable does **not** cancel provider renewals. Before removing
  billing or switching providers, a human must deal with all existing paid
  subscriptions. Provider migration is not automatic; never casually change
  configured price IDs or provider on an existing paying deployment.

On the VPS, the runtime image includes the operator scripts (no host Node needed):

```bash
docker compose -f compose.prod.yaml --env-file .env exec -T app node scripts/billing-reconcile.js
docker compose -f compose.prod.yaml --env-file .env logs --tail=100 app
```

If deployment pins `.release.env`, use the existing `scripts/prod-compose.sh`
wrapper as documented in DEPLOY.md. Scheduler runs in app; an optional cron
reconcile command may run too, using the same DB lease. Inspect counts/status
in `billing_events` (`doneAt`, `retryAt`, `attempts`), `billing_mail` and
`billing_audit` with restricted operator DB access. Never print personal
provider objects or secrets into CI logs. Back up these collections with the
rest of Mongo and test restore before enabling real renewals.

## Automated verification and scope

`npm test` runs real Mongo-backed mock lifecycle/admin/replay/order/grace,
concurrent checkout, provider-outage retries, multi-worker reconciliation,
account deletion and translated-mail tests. Stripe adapter tests use the real
SDK signature verifier and an injected client for exact checkout/price/portal
contracts; they make no network/payment calls. `npm run lint`,
`npm run format:check`, OpenAPI validation, web build, existing web E2E and
Android checks remain required. Use an isolated DB; tests remove their own data.

P2b Paddle is **not implemented or selected**. It requires a separate owner
decision about Merchant of Record responsibilities, taxes and invoices, then a
new adapter with recorded-fixture contract tests. Keep Stripe when adding it.
