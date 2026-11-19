package si.sotovor.app

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource

@Composable
fun NotificationControls(state: WorkspaceState, model: WorkspaceViewModel, push: NativePush) {
    var expanded by remember { mutableStateOf(false) }
    var denied by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        denied = !granted
        if (granted) push.requestToken()
    }
    Column {
        TextButton(onClick = {
            expanded = !expanded
            if (expanded) model.loadNotificationSettings()
        }, enabled = !state.busy) { Text(stringResource(R.string.notification_settings)) }
        if (expanded) {
            state.notificationSettings?.let { value ->
                ToggleRow(R.string.push_assignments, value.assignments, !state.busy) {
                    model.saveNotificationSettings(value.copy(assignments = it))
                }
                ToggleRow(R.string.push_reminders, value.reminders, !state.busy) {
                    model.saveNotificationSettings(value.copy(reminders = it))
                }
                ToggleRow(R.string.push_swaps, value.swaps, !state.busy) {
                    model.saveNotificationSettings(value.copy(swaps = it))
                }
            }
            if (push.available) {
                OutlinedButton(onClick = {
                    if (Build.VERSION.SDK_INT >= 33 && !permissionGranted(context)) {
                        permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        denied = !permissionGranted(context)
                        if (!denied) push.requestToken()
                    }
                }) { Text(stringResource(R.string.enable_push)) }
            }
            if (denied) Text(stringResource(R.string.push_denied))
        }
    }
}
