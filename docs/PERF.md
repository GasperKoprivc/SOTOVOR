# Performance rehearsal

Measured on 18 November 2026 on Windows with Docker Desktop, an AMD Ryzen 7
7800X3D (16 logical processors), the production Node 24.22.3 Alpine image and
MongoDB 8.0.38. The load generator ran on the host with Node 24.15.0. Other
development processes were running. This is a local baseline for comparison.

The disposable fixture has one family and thirty tasks. Each endpoint ran
with ten concurrent connections for ten seconds. The three private reads used
a real bearer token from the native login API.

| Endpoint                               | Requests/s | p50   | p99   | Errors, timeouts or non-2xx |
| -------------------------------------- | ---------- | ----- | ----- | --------------------------- |
| /api/releases/latest                   | 9082.00    | 1 ms  | 2 ms  | 0                           |
| /api/v1/dashboard?includeEntries=false | 1339.70    | 6 ms  | 19 ms | 0                           |
| /api/v1/tasks                          | 943.90     | 10 ms | 16 ms | 0                           |
| /api/v1/shopping                       | 1294.30    | 7 ms  | 12 ms | 0                           |

Reproduce with the test Compose stack and npm run test:load. The script writes
raw results into quality-results/load.json, removes its fixture account and
fails on errors or non-2xx responses. GitHub keeps the report as an artifact.
The public release endpoint exercises the cached/unavailable release response
when GitHub credentials are absent.

## Android measurements

The release target is API 36 and uses R8. CI uses UIAutomator to drive the QA app with production shrinker rules and
a test signature, while Compose tests drive the debug app. See the completed rehearsal measurements below.

Production Firebase delivery, signing identity, hardware recording behavior
and final store-download size need a signed release and a physical device.
Record them with ANDROID_MANUAL_TEST.md before public launch.

For repeatable cold starts, force-stop the process and run
adb shell am start -S -W -n si.sotovor.app/.MainActivity five times on the
same hardware, saving TotalTime and WaitTime. Report startup to interactive
workspace separately because Android's initial-display time excludes API
loading. Compare the same family and network conditions on each run.

### Local release rehearsal, 18 November 2026

- Production unsigned R8 APK: **3,392,812 bytes (3.24 MiB)**, min API 26,
  target API 36 verified in the generated manifest. It has no Firebase
  configuration or production signing key in this environment.
- Installed QA R8 APK: **3,405,444 bytes (3.25 MiB)**. Same production
  shrinker rules, local API origin, QA package suffix and debug signature.
  SHA-256: `08973eea4253eb9acdadbc8ceddf05b7235793c4fb570cea75edf7a7c7d06f65`.
- API 36 x86_64 emulator, five force-stopped starts after the authenticated
  task/voice/deep-link test. Android TotalTime: **1400, 1077, 1030, 990,
  1152 ms**; median **1077 ms**. WaitTime: **1402, 1079, 1032, 992, 1232 ms**.
- Reproduce on Windows with
  `./scripts/android-startup.ps1 -Apk apps/android/app/build/outputs/apk/qa/app-qa.apk`.
  The script records device, checksum and raw runs in
  `quality-results/android-startup.json`. Emulator numbers exclude API readiness
  and do not establish physical-device startup or Play download size.
- All five instrumented tests passed: Compose authentication/task/calendar/
  notification denial, large-font accessibility, two component tests, and
  UIAutomator driving login, real audio capture/playback, task completion and
  an OS-dispatched deep link in the minified QA app.
