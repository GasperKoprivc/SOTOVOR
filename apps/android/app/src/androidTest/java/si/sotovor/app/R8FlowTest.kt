package si.sotovor.app

import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestWatcher
import org.junit.runner.Description

/** The debug test process drives the production-shrunk QA APK through Android UI automation. */
class R8FlowTest {
    @get:Rule val diagnostics = object : TestWatcher() {
        override fun failed(error: Throwable, description: Description) {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val device = UiDevice.getInstance(instrumentation)
            val directory = checkNotNull(instrumentation.targetContext.externalCacheDir)
            device.takeScreenshot(File(directory, "r8-failure.png"))
            device.dumpWindowHierarchy(File(directory, "r8-failure.xml"))
            // AGP uninstalls the target after testing; preserve diagnostics in shell-owned storage.
            for (extension in listOf("png", "xml")) {
                device.executeShellCommand(
                    "cp ${File(directory, "r8-failure.$extension").absolutePath} /data/local/tmp/sotovor-r8-failure.$extension"
                )
            }
        }
    }

    @Test fun minifiedLoginVoiceTaskAndDeepLink() {
        assumeTrue(
            "Install assembleQa and supply the r8 instrumentation argument.",
            InstrumentationRegistry.getArguments().getString("r8") == "true"
        )
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val client = OkHttpClient()
        val email = "r8-${UUID.randomUUID()}@test.invalid"
        val password = "R8-quality-password-23"
        fun post(path: String, body: String, access: String? = null): String {
            val request = Request.Builder().url(BuildConfig.BASE_URL + "api/v1/" + path)
                .post(body.toRequestBody("application/json".toMediaType()))
                .apply { if (access != null) header("Authorization", "Bearer $access") }.build()
            return client.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "R8 fixture $path failed (${response.code})" }
                checkNotNull(response.body).string()
            }
        }
        post(
            "auth/register",
            """{"firstName":"Release","lastName":"Test","email":"$email","phone":"+38640000111","password":"$password"}"""
        )
        val credentials = Json.parseToJsonElement(
            post(
                "mobile/auth/login",
                """{"email":"$email","password":"$password","deviceName":"R8 fixture"}"""
            )
        ).jsonObject
        val access = credentials.getValue("accessToken").jsonPrimitive.content
        post("households", """{"householdName":"R8 family","expectedMembers":2}""", access)

        fun click(label: String) {
            repeat(8) {
                val target = device.findObjects(By.text(label)).mapNotNull { text ->
                    var node = text
                    while (!node.isClickable && node.parent != null) node = node.parent
                    node.takeIf { it.isClickable }
                }.lastOrNull()
                if (target != null) {
                    target.click()
                    device.waitForIdle()
                    return
                }
                val scroll = device.findObjects(By.scrollable(true)).lastOrNull()
                scroll?.scroll(Direction.DOWN, 0.7f)
                device.wait(Until.hasObject(By.text(label)), 1_000)
            }
            error("R8 UI control was unavailable: $label")
        }
        fun shown(label: String) {
            check(device.wait(Until.hasObject(By.text(label)), 30_000)) { "R8 UI did not display $label" }
        }

        val pkg = "si.sotovor.app.qa"
        device.wakeUp()
        device.executeShellCommand("wm dismiss-keyguard")
        device.executeShellCommand("pm clear $pkg")
        device.executeShellCommand("am start -W -n $pkg/si.sotovor.app.MainActivity")
        shown("Prijava")
        click("Prijava")
        check(device.wait(Until.hasObject(By.clazz("android.widget.EditText")), 10_000))
        val fields = device.findObjects(By.clazz("android.widget.EditText"))
        check(fields.size == 2)
        fields[0].text = email
        fields[1].text = password
        click("Prijava")
        shown("Opravila")
        click("Opravila")
        click("Dodaj opravilo")
        check(device.wait(Until.hasObject(By.clazz("android.widget.EditText")), 10_000))
        device.findObjects(By.clazz("android.widget.EditText"))[0].text = "R8 voice task"
        device.executeShellCommand("pm grant $pkg android.permission.RECORD_AUDIO")
        click("Posnemi beležko")
        SystemClock.sleep(1_500)
        click("Ustavi snemanje")
        click("Shrani")
        shown("R8 voice task")
        click("R8 voice task")
        click("Predvajaj posnetek")
        shown("Ustavi predvajanje")
        click("Ustavi predvajanje")
        click("Prevzemi")
        shown("Zaključi")
        click("Zaključi")

        val request = Request.Builder().url(BuildConfig.BASE_URL + "api/v1/dashboard")
            .header("Authorization", "Bearer $access").build()
        val dashboard = client.newCall(request).execute().use { response ->
            Json.parseToJsonElement(checkNotNull(response.body).string()).jsonObject
        }
        val task = dashboard.getValue("entries").jsonArray.first {
            it.jsonObject["title"]?.jsonPrimitive?.content == "R8 voice task"
        }.jsonObject
        check(task.getValue("completedAt").jsonPrimitive.content != "null")
        check(task.getValue("voice").jsonObject.getValue("mime").jsonPrimitive.content == "audio/mp4")
        val household = dashboard.getValue("household").jsonObject.getValue("id").jsonPrimitive.content
        val id = task.getValue("id").jsonPrimitive.content
        device.executeShellCommand(
            "am start -W -a android.intent.action.VIEW -d sotovor://task?householdId=$household&entryId=$id -p $pkg"
        )
        shown("Podrobnosti vnosa")
        click("Prekliči")
        device.pressHome()
    }
}
