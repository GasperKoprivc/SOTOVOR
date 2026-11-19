package si.sotovor.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Run against compose.test.yaml with -PsotovorDebugUrl=http://10.0.2.2:3060/. */
class FamilyFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun waitFor(text: String) {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun click(text: String) {
        waitFor(text)
        val target = hasText(text) and hasClickAction()
        val dialogTarget = target and hasAnyAncestor(isDialog())
        val node = if (compose.onAllNodes(dialogTarget).fetchSemanticsNodes().isNotEmpty()) {
            compose.onNode(dialogTarget)
        } else {
            compose.onNode(target)
        }
        if (!node.isDisplayed()) node.performScrollTo()
        node.performClick()
    }

    @Test fun loginCreateClaimCompleteCalendarAndPermissionDenial() {
        val client = OkHttpClient()
        val email = "native-${UUID.randomUUID()}@test.invalid"
        val password = "Quality-password-231"
        fun post(path: String, body: String, access: String? = null): String {
            val request = Request.Builder().url(BuildConfig.BASE_URL + "api/v1/" + path)
                .post(body.toRequestBody("application/json".toMediaType()))
                .apply { if (access != null) header("Authorization", "Bearer $access") }.build()
            return client.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "Fixture request $path failed (${response.code})" }
                checkNotNull(response.body).string()
            }
        }
        post("auth/register", """{"firstName":"Native","lastName":"Test","email":"$email","phone":"+38640000111","password":"$password"}""")
        val credentials = Json.parseToJsonElement(
            post("mobile/auth/login", """{"email":"$email","password":"$password","deviceName":"Fixture"}""")
        ).jsonObject
        val access = credentials.getValue("accessToken").jsonPrimitive.content
        post("households", """{"householdName":"Native quality","expectedMembers":2}""", access)

        click("Prijava")
        compose.onNodeWithText("E-pošta").performTextInput(email)
        compose.onNodeWithText("Geslo").performTextInput(password)
        click("Prijava")
        click("Opravila")
        click("Dodaj opravilo")
        compose.onNodeWithText("Naslov").performTextInput("Native quality task")
        val ui = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        ui.executeShellCommand("pm grant ${compose.activity.packageName} android.permission.RECORD_AUDIO")
        click("Posnemi beležko")
        // MediaRecorder needs real elapsed time to write an audio sample.
        SystemClock.sleep(1_200)
        click("Ustavi snemanje")
        click("Shrani")
        click("Native quality task")
        click("Predvajaj posnetek")
        waitFor("Ustavi predvajanje")
        click("Ustavi predvajanje")
        click("Prevzemi")
        compose.waitForIdle()
        waitFor("Native quality task")
        // Claim refreshes the editor. Open it again only when the dialog was closed.
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("Zaključi").fetchSemanticsNodes().isNotEmpty()
        }
        click("Zaključi")
        click("Koledar")
        click("Dodaj dogodek")
        compose.onNodeWithText("Naslov").performTextInput("Native quality event")
        click("Shrani")
        waitFor("Native quality event")

        if (Build.VERSION.SDK_INT >= 33) {
            compose.runOnUiThread {
                ActivityCompat.requestPermissions(compose.activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 78)
            }
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            val deny = device.wait(
                Until.findObject(By.res(Regex(".*:id/permission_deny_button").toPattern())),
                15_000
            )
            checkNotNull(deny) { "Android notification permission prompt did not appear" }.click()
            assertEquals(
                PackageManager.PERMISSION_DENIED,
                ContextCompat.checkSelfPermission(compose.activity, Manifest.permission.POST_NOTIFICATIONS)
            )
            click("Opravila")
        }
        val dashboardRequest = Request.Builder().url(BuildConfig.BASE_URL + "api/v1/dashboard")
            .header("Authorization", "Bearer $access").build()
        client.newCall(dashboardRequest).execute().use { response ->
            val dashboard = Json.parseToJsonElement(checkNotNull(response.body).string()).jsonObject
            val entries = dashboard.getValue("entries").jsonArray
            check(entries.any { it.jsonObject["title"]?.jsonPrimitive?.content == "Native quality event" })
            check(
                entries.any {
                    it.jsonObject["title"]?.jsonPrimitive?.content == "Native quality task" &&
                        it.jsonObject["completedAt"]?.jsonPrimitive?.content != "null"
                }
            )
        }
    }
}
