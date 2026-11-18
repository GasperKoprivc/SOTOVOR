# Instrumentation code executes in the target process. R8 cannot see these
# cross-APK references while shrinking the application. Retain shared test
# infrastructure only in QA; Sotovor application classes still run through R8.
-keep class androidx.** { *; }
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class kotlinx.serialization.** { *; }
