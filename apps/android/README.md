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
.\gradlew.bat lintDebug testDebugUnitTest assembleDebug assembleRelease
```

On macOS and Linux use `./gradlew`. CI uploads the debug APK as `sotovor-android-debug`. An unsigned release build exercises R8.

The app builds without Firebase. To enable the Android Firebase SDK, add the matching `google-services.json` as `app/google-services.json`. See the [firebase and App Links setup](../../docs/HUMAN_TASKS.md#android-app-links-and-firebase).
