package si.sotovor.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.serialization.Serializable

@Serializable
data class CalendarSubscription(val active: Boolean, val path: String? = null)

@Composable
fun CalendarSubscriptionControls(state: WorkspaceState, model: WorkspaceViewModel) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val subscription = state.calendarSubscription
    Column {
        TextButton(onClick = { expanded = !expanded }) { Text(stringResource(R.string.calendar_subscription)) }
        if (expanded) {
            Text(stringResource(R.string.calendar_subscription_privacy))
            TextButton(enabled = !state.busy && subscription != null, onClick = { model.changeCalendarSubscription(false) }) {
                Text(stringResource(if (subscription?.active == true) R.string.calendar_replace else R.string.calendar_create))
            }
            if (subscription?.active == true) {
                TextButton(
                    enabled = !state.busy,
                    onClick = { model.changeCalendarSubscription(true) }
                ) { Text(stringResource(R.string.calendar_revoke)) }
            }
            subscription?.path?.let { path ->
                val url = BuildConfig.BASE_URL.trimEnd('/') + path
                SelectionContainer { Text(url) }
                TextButton(onClick = {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                    context.startActivity(Intent.createChooser(send, context.getString(R.string.calendar_subscription)))
                }) { Text(stringResource(R.string.calendar_share)) }
            }
        }
    }
}

@Composable
fun AddToPhoneCalendar(event: Entry) {
    val context = LocalContext.current
    var unavailable by rememberSaveable(event.id) { mutableStateOf(false) }
    OutlinedButton(onClick = {
        val day = LocalDate.parse(event.dueOn)
        val time = event.startTime?.let(LocalTime::parse)
        val start = if (time == null) {
            day.atStartOfDay(ZoneOffset.UTC)
        } else {
            day.atTime(time).atZone(ZoneId.of("Europe/Ljubljana"))
        }
        val intent = Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, event.title)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start.toInstant().toEpochMilli())
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, time == null)
        val end = if (time == null) start.plusDays(1) else event.durationMinutes?.let { start.plusMinutes(it.toLong()) }
        end?.let { intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, it.toInstant().toEpochMilli()) }
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            unavailable = true
        }
    }) { Text(stringResource(R.string.calendar_add_phone)) }
    if (unavailable) Text(stringResource(R.string.calendar_app_unavailable))
}
