package si.sotovor.app

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

@Composable
fun SotovorNav(model: WorkspaceViewModel, push: NativePush) {
    val state by model.state.collectAsStateWithLifecycle()
    val upgrade by model.updateLevel.collectAsStateWithLifecycle()
    val nav = rememberNavController()
    val signedIn = state.workspace != null
    LaunchedEffect(signedIn) {
        val current = nav.currentDestination?.route
        if (signedIn && current != "workspace") {
            nav.navigate("workspace") { popUpTo("welcome") { inclusive = false }; launchSingleTop = true }
        } else if (!signedIn && current == "workspace") {
            nav.popBackStack("welcome", inclusive = false)
        }
    }
    if (upgrade == UpdateLevel.REQUIRED) {
        PanelScreen { UpdateNotice(required = true, dismiss = {}) }
        return
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        if (upgrade == UpdateLevel.OPTIONAL) UpdateNotice(required = false, dismiss = model::dismissUpdate)
        NavHost(navController = nav, startDestination = "welcome", modifier = Modifier.weight(1f)) {
        composable("welcome") {
            PanelScreen {
                Image(painterResource(R.drawable.sotovor_mark), null, Modifier.size(80.dp))
                Text(stringResource(R.string.app_name), style = MaterialTheme.typography.displayMedium)
                Text(stringResource(R.string.welcome_copy), style = MaterialTheme.typography.bodyLarge)
                Status(state)
                Button(enabled = !state.busy, onClick = { model.clearNotice(); nav.navigate("login") }) { Text(stringResource(R.string.sign_in)) }
                OutlinedButton(enabled = !state.busy, onClick = { model.clearNotice(); nav.navigate("register") }) { Text(stringResource(R.string.register)) }
                if (state.problemResource != null) TextButton(onClick = model::reload) { Text(stringResource(R.string.retry)) }
            }
        }
        composable("login") { AuthForm(false, state, model, { model.clearNotice(); nav.popBackStack() }) }
        composable("register") { AuthForm(true, state, model, { model.clearNotice(); nav.popBackStack() }) }
        composable("workspace") {
            state.workspace?.let {
                if (it.household == null) ProfilePage(it, state, model)
                else CoreWorkspace(it, state, model, push)
            }
        }
        }
    }
}

@Composable
fun PanelScreen(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 600.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp), content = content
        )
    }
}

@Composable
fun Status(state: WorkspaceState) {
    val error = state.problem ?: state.problemResource?.let { stringResource(it) }
    if (error != null) Text(error, color = MaterialTheme.colorScheme.error)
    state.notice?.let { Text(stringResource(it), color = MaterialTheme.colorScheme.primary) }
    if (state.busy) CircularProgressIndicator(Modifier.size(24.dp))
}

@Composable
fun Field(label: Int, value: String, change: (String) -> Unit, type: KeyboardType = KeyboardType.Text) {
    OutlinedTextField(
        value, change, label = { Text(stringResource(label)) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = type),
        visualTransformation = if (type == KeyboardType.Password) PasswordVisualTransformation() else VisualTransformation.None,
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun AuthForm(register: Boolean, state: WorkspaceState, model: WorkspaceViewModel, back: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by androidx.compose.runtime.remember { mutableStateOf("") }
    var first by rememberSaveable { mutableStateOf("") }
    var last by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var browserUnavailable by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val title = if (register) R.string.register else R.string.sign_in
    PanelScreen {
        Text(stringResource(title), style = MaterialTheme.typography.headlineLarge)
        if (register) {
            Field(R.string.first_name, first, { first = it })
            Field(R.string.last_name, last, { last = it })
            Field(R.string.phone, phone, { phone = it }, KeyboardType.Phone)
        }
        CredentialFields(email, password, { email = it }, { password = it })
        Status(state)
        Button(
            enabled = !state.busy && email.isNotBlank() && password.isNotBlank() &&
                (!register || (first.isNotBlank() && last.isNotBlank() && phone.isNotBlank() && password.length >= 10)),
            onClick = {
                if (register) model.register(Registration(first.trim(), last.trim(), email.trim(), phone.trim(), password))
                else model.signIn(email, password)
            }
        ) { Text(stringResource(title)) }
        if (!register) TextButton(onClick = {
            try {
                CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(BuildConfig.BASE_URL + "#reset-password"))
            } catch (_: ActivityNotFoundException) {
                browserUnavailable = true
            }
        }) { Text(stringResource(R.string.forgot_password)) }
        if (browserUnavailable) Text(stringResource(R.string.browser_unavailable))
        TextButton(onClick = back, enabled = !state.busy) { Text(stringResource(R.string.back)) }
    }
}

@Composable
fun CredentialFields(email: String, password: String, onEmail: (String) -> Unit, onPassword: (String) -> Unit) {
    Field(R.string.email, email, onEmail, KeyboardType.Email)
    Field(R.string.password, password, onPassword, KeyboardType.Password)
}

@Composable
fun FamilyControls(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    val incoming by model.links.collectAsStateWithLifecycle()
    var mode by rememberSaveable { mutableStateOf("") }
    var familyName by rememberSaveable { mutableStateOf("") }
    var sizeText by rememberSaveable { mutableStateOf("4") }
    var code by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(workspace.household?.id) { mode = ""; code = "" }
    LaunchedEffect(incoming, workspace.household?.id) {
        val invitation = incoming as? NativeLink.Invite ?: return@LaunchedEffect
        mode = "join"
        code = invitation.code
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.greeting, workspace.profile.firstName), style = MaterialTheme.typography.headlineLarge)
        workspace.household?.let { Text(it.name, style = MaterialTheme.typography.titleLarge) }
        Status(state)
        if (workspace.profile.emailVerificationPending) {
            Text(stringResource(R.string.verify_email))
            OutlinedButton(onClick = model::resend, enabled = !state.busy) { Text(stringResource(R.string.resend_email)) }
        }
        if (workspace.spaces.size > 1) {
            Text(stringResource(R.string.switch_family), style = MaterialTheme.typography.titleMedium)
            workspace.spaces.forEach { space ->
                if (space.id != workspace.household?.id) OutlinedButton(
                    enabled = !state.busy, onClick = { model.switchFamily(space.id) }
                ) { Text(space.name) }
            }
        }
        if (workspace.household == null || workspace.spaces.all { it.admin }) {
            if (mode != "create") OutlinedButton(onClick = { mode = "create"; model.clearNotice() }, enabled = !state.busy) {
                Text(stringResource(R.string.new_family))
            }
        }
        if (workspace.spaces.all { it.admin } && mode != "join") {
            OutlinedButton(onClick = { mode = "join"; model.clearNotice() }, enabled = !state.busy) {
                Text(stringResource(R.string.join_family))
            }
        }
        when (mode) {
            "create" -> {
                Field(R.string.family_name, familyName, { familyName = it })
                Field(R.string.family_size, sizeText, { sizeText = it }, KeyboardType.Number)
                val size = sizeText.toIntOrNull()
                Button(enabled = !state.busy && familyName.isNotBlank() && size != null && size in 1..100,
                    onClick = { size?.let { model.createFamily(familyName.trim(), it) } }) {
                    Text(stringResource(R.string.new_family))
                }
            }
            "join" -> {
                Field(R.string.invite_code, code, { code = it })
                Button(enabled = !state.busy && code.trim().length == 32, onClick = { model.joinFamily(code) }) {
                    Text(stringResource(R.string.join_family))
                }
            }
        }
        if (mode.isNotEmpty()) TextButton(onClick = { mode = ""; model.clearLink() }, enabled = !state.busy) {
            Text(stringResource(R.string.cancel))
        }
        if (workspace.household != null && !workspace.admin) {
            if (workspace.leaveRequested) Text(stringResource(R.string.leave_requested))
            else TextButton(onClick = model::leaveRequest, enabled = !state.busy) { Text(stringResource(R.string.request_leave)) }
        }
        TextButton(onClick = model::signOut, enabled = !state.busy) { Text(stringResource(R.string.sign_out)) }
    }
}
