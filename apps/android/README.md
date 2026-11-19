# Sotovor for Android

Open this folder in Android Studio. The project uses Kotlin, Jetpack Compose and the shared Sotovor API v1. The package is `si.sotovor.app`, minimum Android 8 (API 26), compile and target API 36, and Java/Kotlin toolchain 17. [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)

## Run on an emulator

1. Install the current stable Android Studio and JDK 17. In **Settings → Build, Execution, Deployment → Build Tools → Gradle**, select JDK 17.
2. In **SDK Manager**, install **Android 16 (API 36)**, **Android SDK Build-Tools 35.0.0**, **Android SDK Platform-Tools**, and **Android Emulator**.
3. If needed on Windows, enable CPU virtualization in BIOS/UEFI, then enable **Windows Hypervisor Platform** in Windows Features and restart.
4. In **Device Manager**, create a Pixel virtual device with an API 36 or newer **Google Play** system image. Start the emulator.
5. From the repository root, start the backend with `.\start.bat`. In another terminal run `npm.cmd run seed:demo` and read `data/demo-password.txt`. Sign in as `ana@demo.sotovor.test` with that password, or register an account.
6. Open `apps/android` in Android Studio, select the debug variant and the emulator, and click **Run**.

The emulator debug build uses `http://10.0.2.2:3000/`. To test a real device, put `sotovorDebugUrl=http://YOUR_LAN_IP:3000/` in `local.properties`, start the server with `SOTOVOR_HOST=0.0.0.0`, and allow LAN access to the app port. Set `sotovorReleaseUrl=https://YOUR_PUBLIC_DOMAIN/` before distributing release builds. Both URLs can also be set via Gradle `-P` properties. Release builds refuse HTTP.

To check rotation, temporarily run the backend with `SOTOVOR_MOBILE_ACCESS_SECONDS=5`, sign in, wait for expiry and switch a family or refresh the workspace. The app refreshes the credentials and retries the authorized request.

## Build checks

```powershell
cd apps/android
.\gradlew.bat ktlintCheck detekt lintDebug testDebugUnitTest assembleDebug assembleRelease dependencyInventory
```

On macOS and Linux use `./gradlew`. CI uploads the debug APK as `sotovor-android-debug`. An unsigned release build exercises R8.

Instrumented tests create disposable accounts and families. Use `compose.test.yaml` rather than your regular development database. From the repository root, start `docker compose -p sotovor-quality -f compose.test.yaml up -d --build --wait`. With an API 36 emulator running, execute these commands in `apps/android`:

```powershell
.\gradlew.bat assembleQa assembleDebug assembleDebugAndroidTest -PsotovorDebugUrl=http://127.0.0.1:3060/
adb reverse tcp:3060 tcp:3060
adb install -r app/build/outputs/apk/qa/app-qa.apk
.\gradlew.bat connectedDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.r8=true' -PsotovorDebugUrl=http://127.0.0.1:3060/
```

Use `./gradlew` on Linux/macOS. CI runs the API 36 Google ATD image. UIAutomator drives the minified QA app; Compose tests drive the debug app. QA uses the production R8 rules with a local URL, separate package and test signature. After testing, remove the disposable stack with `docker compose -p sotovor-quality -f compose.test.yaml down --volumes` from the repository root. Full device acceptance, including TalkBack, push and verified HTTPS App Links, is in [ANDROID_MANUAL_TEST.md](../../docs/ANDROID_MANUAL_TEST.md).

In the app, the workspace tabs open the dashboard, filtered task pages, calendar, workload, notifications and profile. Profile can revoke a device or export the account as a JSON file.

## Push, invite links and updates

The app builds and runs without Firebase. Add `app/google-services.json` to enable push locally. The optional GitHub secret `GOOGLE_SERVICES_JSON_BASE64` supplies that file for a second debug artifact. CI always builds a Firebase-free APK first. Set the server's Firebase service account separately and grant phone notifications in the app's **Notifications → Notification settings**. In-app notices stay available if phone notifications are off.

Set `sotovorReleaseUrl` to the public HTTPS domain before building an APK that should handle verified invitations. Add the app-signing SHA-256 fingerprint to the server's asset links. With a real invite, run:

```bash
adb shell am start -a android.intent.action.VIEW -d "https://sotovor.example.com/join/0123456789abcdef0123456789abcdef"
adb shell pm get-app-links si.sotovor.app
```

Use your actual domain and invite code. Without an installed, verified app, the same URL opens the website's join form. Set `sotovorUpdateUrl` to a public APK download page or the Play listing before publishing. The server's minimum and latest versions control the blocking and optional update prompts.

See [Firebase credentials and signing setup](../../docs/HUMAN_TASKS.md#android-app-links-and-firebase).
