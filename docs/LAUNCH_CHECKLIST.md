# Public launch checklist

Use this as a dated sign-off record for the exact commit and release assets.
Automated checks passing permits a release candidate. Production and human
checks below remain release conditions until independently verified.

## Readiness audit: 22 November 2026

The owner confirmed that the domain and VPS have not been provisioned yet.
The public-launch definition of done is therefore **not complete**.

- No GitHub Release is published, and the `SOTOVOR_PRODUCTION_URL` and `DEPLOY_ENABLED` repository variables are not configured.
- Docker Hub credentials and Tauri updater signing secrets are present; their private values were not read.
- Production SSH, Android keystore and Firebase secret names are absent. Configure them using [HUMAN_TASKS.md](HUMAN_TASKS.md).
- The local rehearsal passed 30 API tests, four browser cases and five instrumented Android tests, including the R8 QA voice/deep-link flow. Measurements are in [PERF.md](PERF.md).
- Baseline `1cee4a7` passed [CI](https://github.com/GasperKoprivc/SOTOVOR/actions/runs/44497238741), [Android](https://github.com/GasperKoprivc/SOTOVOR/actions/runs/44497238816) and [Launch quality gate](https://github.com/GasperKoprivc/SOTOVOR/actions/runs/44497238702), including the emulator tests. Every subsequent release commit must pass the gate again.
- Public email delivery, production downloads, daily backups and signed-device/Firebase acceptance remain unverified until infrastructure and signing are configured. Installer rehearsals use a placeholder origin and are not production downloads.

### Requirement-by-requirement evidence

| Phase 6 requirement                | Implementation and evidence                                                                          | Remaining acceptance                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Web/backend lint and formatting | `eslint.config.js`, `.prettierrc.json`, root npm scripts and `ci.yml`                                | Gate must pass on the final release commit.                                                |
| 2. Android static checks           | `app/build.gradle.kts`, `config/detekt.yml`, `android.yml`; selected Lint warnings are errors        | Reviewed advisories are documented below.                                                  |
| 3. Web E2E                         | `e2e/family.spec.js`, Mailpit in `compose.test.yaml`, desktop and phone Playwright projects          | Real production SMTP is a separate acceptance check.                                       |
| 4. Android E2E                     | `FamilyFlowTest`, `R8FlowTest`, Compose accessibility tests, API 36 emulator job                     | Physical-device scenarios in `ANDROID_MANUAL_TEST.md`.                                     |
| 5. Accessibility                   | Browser axe/keyboard assertions, labelled checkbox rows, 48dp targets and 200% font test             | Human TalkBack, visual contrast and launcher/widget review.                                |
| 6. Android release readiness       | R8 QA workflow, installer rehearsal, `PERF.md`, `PLAY_STORE_CHECKLIST.md`; target API 36             | Final signing, Firebase push, physical device and human Play/privacy review.               |
| 7. Authenticated API load          | `scripts/load-test.js`, `PERF.md`; CI retains raw reports                                            | Measure the actual VPS after provisioning.                                                 |
| 8. Dependencies                    | npm audit, resolved Maven OSV audit, Dependabot for npm/Gradle/Actions/Docker, version-pinned images | Continue scheduled audits; major Android toolchain upgrades require coordinated migration. |
| 9. Launch sign-off                 | This checklist, `DEPLOY.md`, `HUMAN_TASKS.md`, production TLS/auth/backup/restore integration test   | Public HTTPS, real email, signing, downloads and operational backups need infrastructure.  |

The installer workflow supersedes the old raw-Windows-executable PR #4.
The Windows startup smoke test from PR #1 is adapted to the current launcher:
it installs dependencies and builds in an isolated temporary checkout, then
checks reuse of a fixture server with browser and desktop launch disabled.
It does not test a fresh MongoDB installation or real browser launch.

The separate Android toolchain proposals #32 (AGP 9.5.1), #35 (Gradle 9.9.1)
and #36 (Hilt 2.60.1) fail before app compilation. AGP 9.5.1 requires Gradle
9.6+, while Gradle 9.9.1 fails with the current AGP service API and the Hilt
proposal fails plugin application. Retain the audited, green AGP 8.13.2 /
Gradle 8.13 / Hilt 2.57.2 combination rather than merge incompatible updates.
These optional upgrades are not a prerequisite for the existing API 36 target.

## Automated quality gate

- [ ] GitHub `CI`, `Android` and `Launch quality gate` pass for the release commit.
- [ ] ESLint, Prettier, ktlint, detekt and selected Android Lint errors pass.
- [ ] API tests and OpenAPI validation pass.
- [ ] Docker-based browser tests pass at desktop and phone widths, including
      a real verification message captured by the test mail sink.
- [ ] Debug and R8-minified QA emulator tests pass against the Compose API, including permission denial.
- [ ] npm and resolved Maven dependency audits are clear, with reports retained.
- [ ] Production stack integration test creates a backup, modifies data,
      restores the archive and verifies data and indexes.

## Production and human sign-off

- [ ] DNS and valid public HTTPS are verified on the final domain. `/healthz`
      and `/readyz` return success. Microphone capture works over HTTPS.
- [ ] Registration and password reset deliver real messages through production SMTP.
- [ ] MongoDB authentication is enforced and no database port is internet-accessible.
- [ ] Daily backup cron is installed, retention is correct and a recent archive
      has been restored into an isolated database with records and indexes checked.
- [ ] App, proxy and host logs are reviewed after a representative multi-client run.
- [ ] Human review of privacy policy, terms, child profile handling, provider
      retention and the Play Data safety form is complete.
- [ ] Demo accounts and test families are removed. Confirm the seed script is
      unavailable to production automation and refuses `NODE_ENV=production`.
- [ ] `SOTOVOR_TEST_MAIL_SINK` is absent and the production image uses `NODE_ENV=production`.
- [ ] Firebase project, package identifier and App Links fingerprints match the
      final direct-download certificate and Play App Signing certificate.
- [ ] Signed APK installs from `/prenesi` on a real phone, signs in and receives push.
- [ ] Windows installer and Tauri updater signatures are verified from `/prenesi`.
- [ ] Final R8 build passes the physical-device script, including push, voice
      and deep links. Store upload signing and mapping files are backed up.
- [ ] Accessibility review covers keyboard, TalkBack, 200% font size, contrast
      and 48dp Android touch targets, with failures resolved.
- [ ] Final size, cold start and API load results are recorded in `PERF.md`.
- [ ] Rollback image and restoration procedure are ready. Monitoring is enabled.

## Reproduce the gate locally

```sh
npm ci
npm run lint
npm run format:check
npm test
node backend/test/validate-openapi.js
docker compose -p sotovor-quality -f compose.test.yaml up -d --build --wait
npx playwright install chromium
npm run test:e2e
npm run test:load
cd apps/android
./gradlew ktlintCheck detekt lintDebug testDebugUnitTest assembleRelease dependencyInventory
./gradlew assembleQa -PsotovorDebugUrl=http://10.0.2.2:3060/
adb install -r app/build/outputs/apk/qa/app-qa.apk
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.r8=true -PsotovorDebugUrl=http://10.0.2.2:3060/
cd ../..
node scripts/audit-gradle.js
npm audit --audit-level=high
docker compose -p sotovor-quality -f compose.test.yaml down --volumes
```

`compose.test.yaml` uses a disposable database and loopback-only mail UI.
Keep it isolated from user data. The SMTP bypass is accepted only when
`NODE_ENV=test`; the normal production SMTP validation still requires TLS.

## Static analysis scope

ESLint checks all JavaScript, React hook usage and unused values. Prettier
checks supported web/backend/configuration/documentation files. ktlint owns
Kotlin formatting. detekt checks selected correctness and exception rules
without K1 type resolution because the app uses Kotlin 2.2/K2. All findings
from those selected checks block CI. Android Lint retains its normal errors
and elevates content descriptions, labels, clickable-view accessibility, hardcoded
text, translations and unsafe API use to errors. Dependency update suggestions
remain advisory and are handled through Dependabot. XML launcher sizing
attributes that have a min-API fallback are reviewed separately.

The QA variant uses the release R8 rules with a test-only debug signature,
application-ID suffix and local HTTP access. Public releases retain the
production URL, signing configuration and cleartext restrictions.

UIAutomator drives the R8 QA app from a separate debug test process, while
Compose tests cover the ordinary app. The QA app uses the exact production
ProGuard rules and keeps its local URL, package suffix and test signing key.

## Reviewed advisory findings

| Advisory group                                                      | Disposition                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| AndroidGradlePluginVersion, GradleDependency, NewerVersionAvailable | Pinned versions pass the resolved Maven audit. Dependabot proposes upgrades for review.                                                 |
| InsecureBaseConfiguration                                           | Local HTTP is confined to debug and QA manifests. Release retains HTTPS and cleartext restrictions.                                     |
| UnusedAttribute                                                     | The widget defines minimum dp sizing for API 26 and additional launcher cell sizing for API 31+.                                        |
| UseKtx, UseTomlInstead                                              | API and dependency declaration style suggestions. Existing Java calls preserve behavior and explicit new test tool versions are pinned. |
| ObsoleteSdkInt                                                      | A redundant platform guard is harmless on the supported API range.                                                                      |
| PluralsCandidate                                                    | Numeric metric labels require localization review as part of language acceptance.                                                       |
| ScrollableTabRow and test RequestBody deprecations                  | Existing APIs remain supported by pinned dependencies. Their replacement can follow the dependency upgrade review.                      |

These advisories are retained in the uploaded Android Lint report. Unknown lint
issue IDs are errors, so a misspelled or unavailable configured rule cannot
silently pass the gate.

## CI device and trigger policy

Each pull request runs the full gate once. Pushes to `main` and `v*` tags
run it again before deployment or publication. Manual runs are available.
Branch pushes with an open PR use the PR run, avoiding duplicate emulator jobs.

The API 36 CI emulator uses Google's `google_atd` image and supported software
rendering. ATDs reduce background services and remove the System UI to keep
instrumented app tests reliable on hosted runners. The tests still request and
deny the real Android notification permission, exercise native voice capture
and playback, and dispatch a task deep link through Android. Local runs also
passed on a normal API 36 Google Play image. Actual notification-shade behavior,
TalkBack, launcher/widget presentation and production Firebase remain in the
physical-device checklist. [Android ATD documentation](https://developer.android.com/studio/test/managed-devices#atd)
