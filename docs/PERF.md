# Performance rehearsal

Measured on 18 November 2026 on Windows with Docker Desktop, an AMD Ryzen 7
7800X3D (16 logical processors), the production Node 24.11.1 Alpine image and
MongoDB 8.0.16. The load generator ran on the host with Node 24.15.0. Other
development processes were running. This is a local baseline for comparison.

The disposable fixture has one family and thirty tasks. Each endpoint ran
with ten concurrent connections for ten seconds. The three private reads used
a real bearer token from the native login API.

| Endpoint                               | Requests/s | p50   | p99   | Errors, timeouts or non-2xx |
| -------------------------------------- | ---------- | ----- | ----- | --------------------------- |
| /api/releases/latest                   | 9624.55    | 0 ms  | 2 ms  | 0                           |
| /api/v1/dashboard?includeEntries=false | 1390.30    | 6 ms  | 12 ms | 0                           |
| /api/v1/tasks                          | 817.70     | 11 ms | 18 ms | 0                           |
| /api/v1/shopping                       | 1232.70    | 7 ms  | 11 ms | 0                           |

Reproduce with the test Compose stack and npm run test:load. The script writes
raw results into quality-results/load.json, removes its fixture account and
fails on errors or non-2xx responses. GitHub keeps the report as an artifact.
The public release endpoint exercises the cached/unavailable release response
when GitHub credentials are absent.

## Android measurements

The release target is API 36 and uses R8. CI additionally runs the same
instrumented user flows in the QA variant using release shrinker rules and
a test signature. See the completed rehearsal measurements below.

Production Firebase delivery, signing identity, hardware recording behavior
and final store-download size need a signed release and a physical device.
Record them with ANDROID_MANUAL_TEST.md before public launch.

For repeatable cold starts, force-stop the process and run
adb shell am start -S -W -n si.sotovor.app/.MainActivity five times on the
same hardware, saving TotalTime and WaitTime. Report startup to interactive
workspace separately because Android's initial-display time excludes API
loading. Compare the same family and network conditions on each run.
