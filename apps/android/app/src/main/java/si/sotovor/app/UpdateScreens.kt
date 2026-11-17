package si.sotovor.app

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp

@Composable
fun UpdateNotice(required: Boolean, dismiss: () -> Unit) {
    val context = LocalContext.current
    var unavailable by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(if (required) R.string.update_required else R.string.update_available))
            Button(onClick = {
                try {
                    CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(BuildConfig.UPDATE_URL))
                } catch (_: ActivityNotFoundException) {
                    unavailable = true
                }
            }) { Text(stringResource(R.string.update_app)) }
            if (unavailable) Text(stringResource(R.string.browser_unavailable))
            if (!required) TextButton(onClick = dismiss) { Text(stringResource(R.string.later)) }
        }
    }
}
