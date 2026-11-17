package si.sotovor.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ProfilePage(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    var deleting by remember { mutableStateOf(false) }
    var revoke by remember { mutableStateOf<DeviceSession?>(null) }
    var saveFailed by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val export = state.export
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { document ->
        if (document != null && export != null) scope.launch {
            saveFailed = !withContext(Dispatchers.IO) {
                runCatching {
                    checkNotNull(context.contentResolver.openOutputStream(document)).use { it.write(export.encodeToByteArray()) }
                }.isSuccess
            }
        }
        model.consumeExport()
    }
    LaunchedEffect(export) { if (export != null) launcher.launch("sotovor-data.json") }
    PanelScreen {
        SectionTitle(R.string.profile)
        Text("${workspace.profile.firstName} ${workspace.profile.lastName}")
        Text(workspace.profile.email)
        Text(workspace.profile.phone)
        FamilyControls(workspace, state, model)
        if (workspace.admin) AdminControls(workspace, state, model)
        TextButton(onClick = model::devices, enabled = !state.busy) { Text(stringResource(R.string.devices)) }
        state.devices?.forEach { device ->
            Text(device.deviceName + if (device.current) " · " + stringResource(R.string.this_device) else "")
            TextButton(onClick = { revoke = device }, enabled = !state.busy) { Text(stringResource(R.string.revoke_device)) }
        }
        TextButton(onClick = model::export, enabled = !state.busy) { Text(stringResource(R.string.export_data)) }
        if (saveFailed) Text(stringResource(R.string.error_generic))
        TextButton(onClick = { deleting = true; model.clearNotice() }, enabled = !state.busy) {
            Text(stringResource(R.string.delete_account))
        }
    }
    revoke?.let { device ->
        AlertDialog(
            onDismissRequest = { revoke = null }, title = { Text(stringResource(R.string.revoke_device)) },
            text = { Text(device.deviceName) },
            confirmButton = { TextButton(onClick = { revoke = null; model.revoke(device) }) { Text(stringResource(R.string.revoke_device)) } },
            dismissButton = { TextButton(onClick = { revoke = null }) { Text(stringResource(R.string.cancel)) } }
        )
    }
    if (deleting) DeleteAccountDialog(workspace.spaces.any { it.admin }, state, model) { deleting = false }
}

@Composable
private fun DeleteAccountDialog(owned: Boolean, state: WorkspaceState, model: WorkspaceViewModel, close: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var confirmed by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!state.busy) close() },
        title = { Text(stringResource(R.string.delete_account)) },
        text = {
            Column {
                Text(stringResource(R.string.delete_account_message))
                if (owned) Row {
                    Checkbox(confirmed, { confirmed = it })
                    Text(stringResource(R.string.delete_owned_spaces))
                }
                Field(R.string.password, password, { password = it }, KeyboardType.Password)
                Status(state)
            }
        },
        confirmButton = {
            TextButton(onClick = { model.deleteAccount(DeleteAccount(password, confirmed)) },
                enabled = !state.busy && password.isNotBlank() && (!owned || confirmed)) {
                Text(stringResource(R.string.delete_account))
            }
        },
        dismissButton = { TextButton(onClick = close, enabled = !state.busy) { Text(stringResource(R.string.cancel)) } }
    )
}
