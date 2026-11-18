# Public launch checklist

Use this as a dated sign-off record for the exact commit and release assets.
Automated checks passing permits a release candidate. Production and human
checks below remain release conditions until independently verified.

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
