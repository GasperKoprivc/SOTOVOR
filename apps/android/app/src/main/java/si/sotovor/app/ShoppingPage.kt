package si.sotovor.app

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import kotlinx.serialization.Serializable

@Serializable
data class ShoppingItem(val id: String, val title: String, val quantity: String, val checkedAt: String?, val checkedByName: String?)

@Serializable
data class ShoppingInput(val title: String, val quantity: String)

@Serializable
data class ShoppingCheck(val checked: Boolean)

@Serializable
data class ShoppingPush(val enabled: Boolean)

@Composable
fun ShoppingPage(household: String, state: WorkspaceState, model: WorkspaceViewModel, push: NativePush) {
    var title by rememberSaveable(household) { mutableStateOf("") }
    var quantity by rememberSaveable(household) { mutableStateOf("") }
    val context = LocalContext.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            push.requestToken()
            model.saveShoppingPush(true)
        }
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionTitle(R.string.shopping_title)
                Field(R.string.shopping_item, title, { if (it.length <= 120) title = it })
                Field(R.string.shopping_quantity, quantity, { if (it.length <= 40) quantity = it })
                Button(
                    enabled = !state.busy && title.isNotBlank(),
                    onClick = {
                        model.addShopping(ShoppingInput(title.trim(), quantity.trim())) {
                            title = ""
                            quantity = ""
                        }
                    }
                ) { Text(stringResource(R.string.shopping_add)) }
                Status(state)
                if (push.available && state.shoppingPush != null) {
                    val label = stringResource(R.string.shopping_push)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(label, Modifier.weight(1f))
                        Switch(
                            checked = state.shoppingPush,
                            enabled = !state.busy,
                            modifier = Modifier.semantics { contentDescription = label },
                            onCheckedChange = { enabled ->
                                if (enabled && Build.VERSION.SDK_INT >= 33 && !permissionGranted(context)) {
                                    permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    if (enabled) push.requestToken()
                                    model.saveShoppingPush(enabled)
                                }
                            }
                        )
                    }
                }
                if (state.shopping?.isEmpty() == true) Text(stringResource(R.string.shopping_empty))
            }
        }
        items(state.shopping.orEmpty(), key = { it.id }) { item ->
            val checked = item.checkedAt != null
            val remove = stringResource(R.string.shopping_remove_item, item.title)
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked,
                    { model.checkShopping(item, it) },
                    enabled = !state.busy,
                    modifier = Modifier.semantics { contentDescription = item.title }
                )
                Column(Modifier.weight(1f)) {
                    Text(item.title, textDecoration = if (checked) TextDecoration.LineThrough else TextDecoration.None)
                    if (item.quantity.isNotEmpty()) Text(item.quantity)
                    item.checkedByName?.let { Text(stringResource(R.string.shopping_bought_by, it)) }
                }
                TextButton(
                    enabled = !state.busy,
                    onClick = { model.removeShopping(item) },
                    modifier = Modifier.semantics { contentDescription = remove }
                ) { Text(stringResource(R.string.shopping_remove)) }
            }
        }
    }
}
