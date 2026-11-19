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
  for extension in png xml; do
    path="/data/local/tmp/sotovor-r8-failure.$extension"
    if adb shell test -f "$path"; then adb pull "$path" "$output/"; fi
  done
  docker compose -p sotovor-quality -f "$root/compose.test.yaml" ps -a > "$output/stack-status.txt"
  exit "$result"
}
trap collect EXIT
# ADB forwarding also works when a hosted emulator's 10.0.2.2 routing differs.
adb reverse tcp:3060 tcp:3060
# Preserve Pixel 7's logical phone size while reducing software-rendering work.
adb shell wm size 720x1600
adb shell wm density 280
adb shell settings put system screen_off_timeout 1800000
adb shell svc power stayon true
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
curl --fail http://127.0.0.1:3060/readyz
adb install -r "$root/apps/android/app/build/outputs/apk/qa/app-qa.apk"
"$root/apps/android/gradlew" -p "$root/apps/android" connectedDebugAndroidTest \
  --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8' \
  -Pkotlin.compiler.execution.strategy=in-process \
  -Pandroid.testInstrumentationRunnerArguments.r8=true \
  -PsotovorDebugUrl=http://127.0.0.1:3060/
