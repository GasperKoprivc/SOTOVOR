#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output="$root/quality-results/android"
mkdir -p "$output"
collect() {
  result=$?
  trap - EXIT
  set +e
  adb logcat -d > "$output/logcat.txt"
  adb pull /data/local/tmp/sotovor-r8-failure.png "$output/"
  adb pull /data/local/tmp/sotovor-r8-failure.xml "$output/"
  docker compose -p sotovor-quality -f "$root/compose.test.yaml" ps -a > "$output/stack-status.txt"
  exit "$result"
}
trap collect EXIT
# ADB forwarding also works when a hosted emulator's 10.0.2.2 routing differs.
adb reverse tcp:3060 tcp:3060
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
curl --fail http://127.0.0.1:3060/readyz
adb install -r "$root/apps/android/app/build/outputs/apk/qa/app-qa.apk"
"$root/apps/android/gradlew" -p "$root/apps/android" connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.r8=true \
  -PsotovorDebugUrl=http://127.0.0.1:3060/
