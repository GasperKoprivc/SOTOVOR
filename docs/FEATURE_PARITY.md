# Feature parity

| Feature                             | Backend / OpenAPI                                           | Web and Tauri                                    | Android                                                      |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Shared shopping list                | Family API and WhatsApp quick add                           | Add, check, uncheck, remove, live updates        | Add, check, uncheck, remove, optional FCM alerts             |
| Event time and duration             | All-day or timed events with optional duration              | Editor and weekly time blocks                    | Editor and weekly time blocks                                |
| Private calendar subscription       | Private ICS, rotate and revoke                              | Calendar subscription controls                   | Subscription controls and add an event to the phone calendar |
| Task checklists and comments        | Family-scoped details and comment notifications             | Task details dialog                              | Details inside task editor                                   |
| Task duration and planner weighting | Optional estimate and minute-weighted planning              | Task editor and planner guidance                 | Task editor and planner guidance                             |
| Points and rewards                  | Admin-controlled rewards and child scores                   | Task editor and reward thresholds                | Task editor and reward thresholds                            |
| Weekly and monthly recurrence       | Successor on completion, with rotation                      | Task editor                                      | Task editor                                                  |
| Today widget                        | Member-scoped today endpoint and existing completion action | Android home-screen feature                      | Glance widget, open or complete, background refresh          |
| Voice transcription                 | Disabled by default, configurable provider                  | Voice notes in task details and entry editor     | Voice notes in entry dialog                                  |
| English and dark mode               | Account appearance preferences                              | Slovenian, English and German, light/dark/system | Slovenian and English, light/dark/system                     |

## Shared shopping list

Open **Nakupi** in the family space. Add an item and an optional quantity such as
`2 kg`. Checking an item records the member who bought it. Any member can put it
back on the active list or remove it. Web clients connected to the same app
instance update immediately through SSE.

After pairing the family through the existing WhatsApp integration, send
`nakup mleko` to add milk to the shopping list. The webhook ignores duplicate
deliveries. With Firebase configured, Android members can individually enable
shopping notifications in the shopping screen and grant OS notification access.
Alerts point to the family list and omit item names.

## Event time and duration

Choose **Ves dan** to keep a date-only event. Turn it off to pick a start time
and optionally give the event a duration in minutes. The week view sorts timed
events by start time and shows the continuation on the following day for
overnight events. Times are stored as Europe/Ljubljana local wall time. Older
clients can edit an event without overwriting its timing when they omit the new
fields; existing date-only entries are displayed as all-day.

## Private calendar subscription

Open **Zasebna naročnina na koledar** in the calendar, create a link, and add
that URL as a subscription in your calendar app. It includes events and dated
tasks for all current family memberships. The link is a secret, shown only
when created. Rotate or revoke it if shared by mistake. Previously downloaded
copies may remain in the external calendar's cache.

On Android, open an event and choose **Dodaj v koledar telefona** to hand off
a pre-filled event to an installed calendar app. The user confirms it there.

## Task checklists and comments

Open the details of an existing task. All family members can comment and use
the checklist while the task is open. Completed tasks keep a read-only
checklist and still accept comments. Other family members with assignment
notifications enabled receive comment alerts.

## Estimated task duration

Set an optional estimate in the task editor. The planner uses 30 minutes for
tasks without an estimate and one quarter of the estimate for recent completed
work. It keeps availability, age-appropriate categories, and the existing
planning window. Recurring copies keep the estimate.

## Points and rewards

Family admins can add optional points to a task and set reward thresholds in
the Workload tab. Completing the task credits those points once to its child
assignee. Rewards use earned totals as milestones. With the leaderboard off,
children can see their own score and other members see only the rewards.

## Weekly and monthly recurrence

Set a due date and select either specific weekdays or a day of the month.
A monthly schedule for the 31st uses the last day of shorter months and
returns to the 31st when possible. Day intervals remain available. All three
modes create the next task on completion and can rotate the assignee.

## Android widget

Add **Moja opravila danes** from the Android launcher widget picker. The
widget displays up to three open tasks assigned to you and due today in the
active family. Tap a task to open it, or tap **Končano** to complete it. Android
schedules periodic and push-triggered refreshes through WorkManager. The
launcher can display the titles to anyone with access to the home screen.

## Voice transcription

Transcription is off by default. An operator can set
`SOTOVOR_TRANSCRIPTION_ENABLED=1` and configure a compatible multipart
transcription endpoint, model and optional bearer token. Choose a provider
whose retention policy fits your deployment. Sotovor sends a recording only
after the user requests a transcript and shows a privacy notice before the
request. The response appears in the dialog and Sotovor does not store it.

## Language and theme

Slovenian and dark are the defaults for a fresh installation. Web and Tauri
share the language and theme controls. Android has Slovenian and English in
the Android resources and includes the same theme choices. A German account
preference displays English on Android. Saving preferences while signed in
shares them across clients. The public download page remains Slovenian.

## iPhone and iPad

The responsive web app is available today. The [iOS options evaluation](IOS_OPTIONS.md)
covers a future installable web app or native client.

## Sotovor Pro — P1 entitlements (no payments yet)

The owner's prices are **EUR 3/month including VAT** or **EUR 30/year including
VAT** (two months free). The subscription belongs to a family space, and all
current members share its entitlements. Only that space's admin can start its
one-time, card-free **14-day trial**. P1 does not offer checkout, cancellation,
payment-provider integration or billing screens; those belong to later phases.

`SOTOVOR_BILLING_ENABLED=false` is the default. It unlocks **all** features and
removes all quotas, including the member cap. No billing UI is displayed.
Enable `SOTOVOR_BILLING_ENABLED=true` with `SOTOVOR_BILLING_PROVIDER=mock` to test
Free, trial, expiry and support grants. P1 supports only mock; an enabled unknown
provider or invalid override fails startup. No new dependency was added.

| Feature                                                                                                                    | Free                     | Pro                       | P1 enforcement / clients                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current members                                                                                                            | 5                        | 12                        | Atomic invite acceptance; both cookie and bearer clients. Inactive members do not count. Existing over-limit members keep access.                                                                                                |
| Successful smart-planner previews                                                                                          | 2 per UTC calendar month | Unlimited                 | Atomic space/month counters. Invalid requests and previews with no proposed changes do not count. Apply requires an issued preview; confirming it does not consume a second proposal.                                            |
| WhatsApp                                                                                                                   | No                       | Yes                       | Pair/unlink, pairing delivery and message imports are checked on the server. Verified blocked webhook deliveries return PLAN_REQUIRED and may be retried by Meta. Existing imports remain readable.                              |
| Private ICS                                                                                                                | No                       | Yes                       | Creating/rotating a link requires Pro in the selected space. Every feed read rechecks each family's entitlement and includes only eligible families; revocation stays free.                                                      |
| Shopping lists                                                                                                             | One shared list          | One shared list currently | **Additional active shopping lists: not applicable yet.** No list collection, list-creation endpoint or multi-list UI exists. The existing list and all its items remain free. Limits are reserved for later multi-list support. |
| Stored voice notes                                                                                                         | 20                       | Unlimited                 | Atomic reservations; recordings retained on archived entries still count because they are stored. Existing audio remains playable/exportable. Existing 30-second / 2 MB validation is unchanged.                                 |
| Transcription                                                                                                              | No                       | Yes                       | Requires both entitlement and the separate transcription feature/provider flag.                                                                                                                                                  |
| Completed-work statistics                                                                                                  | 7 / 30 days              | Also all time             | `/statistics` validates the range; web/Tauri and Android check it before enabling the all-time view. Raw historic records remain readable/exportable.                                                                            |
| Child points and rewards                                                                                                   | Read existing data       | Configure/use             | Existing feature is gated for new settings/points and new point awards. Daily task completion remains free even after downgrade.                                                                                                 |
| Daily tasks, claim/swap/complete, calendar, recurrence, overview, notifications, Android widget, apps, export and deletion | Free                     | Included                  | No Pro requirement.                                                                                                                                                                                                              |

### State and API

`backend/src/entitlements.js` is the single policy source. Its pure
`getEntitlements(space, subscription, now, config)` has no clock, DB or env side
effects. Disabled billing wins, followed by a future support grant, an unexpired
trial, active subscription, past-due grace, or the paid-through canceled period.
At the exact expiry instant the corresponding timed grant stops working.
An active state is authoritative; future payment reconciliation must expire it
when appropriate. Past-due state uses `graceUntil`; P2 must set this to seven
days from the payment-failure transition rather than extend it on retries.

The `subscriptions` collection has a unique `spaceId` (Mongo ObjectId).
Provider identifiers are nullable and are never returned to ordinary clients.
`entitlement_usage` has a unique `(spaceId, feature, period)` index; planner
periods are `YYYY-MM` in UTC and stored-recording periods are `stored`.
`billing_audit` records trial starts and manual grants/revocations with actor,
timestamp and support reason. A durable outbox is stored atomically with each
trial/grant state change and replayed idempotently on the next billing read or
operator action if an audit write is interrupted. New spaces initialize their subscription record;
existing spaces have effective Free defaults until a trial or support grant
initializes one. No plan expiry deletes records.

- `GET /api/v1/spaces/:id/billing`: any current member; effective limits,
  features, usage, sanitized subscription status/plan/paid-through date and admin flag.
- `POST /api/v1/spaces/:id/billing/trial` with `{}`: admin only; once per space,
  including after expiry. Concurrent requests cannot create two trials.
- `GET /api/v1/statistics?range=7|30|all`: selected family through the existing
  `X-Sotovor-Household` header; all-time reports require the configured feature.

All these endpoints also exist under the legacy `/api` prefix. A blocked feature
returns HTTP 403 with `{ "error": { "code": "PLAN_REQUIRED", "message": "…",
"details": { "feature": "ics", "limit": null, "current": null,
"upgradeUrl": "/?space=<id>#profil" } } }`. The upgrade URL reserves the
profile entry point for P3; it does not imply that payment UI exists. Web/Tauri show the translated
generic notice and Android maps the code to its local resources. Billing UI and
trial buttons on all clients are intentionally deferred to P3, not silently missing.

Account export includes the caller's accessible spaces' entries (including
base64 audio) and shopping items without provider or session credentials.
Explicit account/family deletion cleans up owned-space billing metadata; this
is separate from plan expiry and is never triggered by downgrade.

### Verification

Run the existing Mongo-backed `npm test`; `billing.integration.test.js` covers
cookie/bearer isolation, admin-only/once-only trials, expiry, simultaneous
member joins and voice reservations, monthly planner quotas, every existing
feature gate, manual grants and downgrade-safe reads/export. The pure policy
table covers exact clock edges and override validation. Run normal web and
Android checks too. Operator commands are in [HUMAN_TASKS.md](HUMAN_TASKS.md#sotovor-pro-p1-operator-testing).

## Sotovor Pro — P2 billing core

| Capability                                    | Backend                                  | Web / Tauri                                        | Android                                       |
| --------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Hosted checkout / portal                      | Admin-only cookie and bearer API         | Hosted handoff + translated errors; settings UI P3 | Bearer API + localized errors; settings UI P3 |
| Signed events, seven-day grace, expiry, audit | Shared canonical state                   | Existing feature gates consume same state          | Same server-enforced gates                    |
| Mock lifecycle and reconciliation             | Tested DB-backed provider + operator CLI | Development hosted consent form                    | Same API; native billing UI P3                |
| Welcome / failed payment / ends soon          | Shared mailer; SL/EN/DE                  | Portal email link; account language                | Same account language; SL/EN errors           |

P2 does not silently ship a partial client subscription screen: purchase and
management screens are explicitly scheduled for P3. Operators can test the
whole core via the API in [BILLING.md](BILLING.md). Stripe is integrated but
live accounts, credentials, tax/legal settings and a public domain still require
the owner. Paddle remains an unselected P2b option.
