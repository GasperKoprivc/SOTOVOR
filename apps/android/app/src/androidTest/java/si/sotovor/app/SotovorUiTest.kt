package si.sotovor.app

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class SotovorUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun credentialFieldsAcceptAnEmail() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        compose.setContent {
            var email by remember { mutableStateOf("") }
            var password by remember { mutableStateOf("") }
            MaterialTheme { Column { CredentialFields(email, password, { email = it }, { password = it }) } }
        }
        compose.onNodeWithText(context.getString(R.string.email)).performTextInput("ana@example.test")
        compose.onNodeWithText("ana@example.test").assertIsDisplayed()
    }

    @Test fun tappingTaskRowOpensTheEntry() {
        val workspace = Workspace(Profile("Ana", "Test", "a@example.test", ""))
        val entry = Entry("1", "Plan dinner", "task", createdAt = "2026-11-17T00:00:00Z")
        var opened: String? = null
        compose.setContent { MaterialTheme { EntryCard(entry, workspace) { opened = entry.id } } }
        compose.onNodeWithText("Plan dinner").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(entry.id, opened) }
    }
}
