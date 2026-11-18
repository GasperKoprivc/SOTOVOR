package si.sotovor.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.time.LocalDate

@Composable
fun <T> SelectField(label: String, current: T, options: List<Pair<T, String>>, enabled: Boolean = true, choose: (T) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val title = options.firstOrNull { it.first == current }?.second.orEmpty()
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text("$label · $title")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, text) ->
                DropdownMenuItem(text = { Text(text) }, onClick = {
                    expanded = false
                    choose(value)
                })
            }
        }
    }
}

@Composable
fun ConflictDialog(onRefresh: () -> Unit) {
    AlertDialog(
        onDismissRequest = onRefresh, title = { Text(stringResource(R.string.entry_conflict)) },
        text = { Text(stringResource(R.string.entry_conflict_message)) },
        confirmButton = { TextButton(onClick = onRefresh) { Text(stringResource(R.string.reload)) } }
    )
}

@Composable
fun EntryDialog(editor: EntryEditor, workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    val original = editor.entry
    val open = original?.completedAt == null
    val canEdit = open && (original == null || workspace.permissions.edit)
    val canDate = open && (original == null || workspace.permissions.move)
    val task = editor.kind == "task"
    var title by rememberSaveable(original?.id, editor.day) { mutableStateOf(original?.title.orEmpty()) }
    var date by rememberSaveable(original?.id, editor.day) { mutableStateOf(original?.dueOn ?: editor.day.orEmpty()) }
    var allDay by rememberSaveable(original?.id) { mutableStateOf(original?.startTime == null) }
    var startTime by rememberSaveable(original?.id) { mutableStateOf(original?.startTime ?: "09:00") }
    var duration by rememberSaveable(original?.id) { mutableStateOf(original?.durationMinutes?.toString().orEmpty()) }
    val context = LocalContext.current
    var category by rememberSaveable(original?.id) { mutableStateOf(original?.category ?: "drugo") }
    var assigned by rememberSaveable(original?.id) { mutableStateOf(original?.assigneeId) }
    var repeat by rememberSaveable(original?.id) { mutableStateOf((original?.repeatDays ?: 0).toString()) }
    var points by rememberSaveable(original?.id) { mutableStateOf(original?.points?.toString().orEmpty()) }
    var estimate by rememberSaveable(original?.id) { mutableStateOf(original?.estimatedMinutes?.toString().orEmpty()) }
    var remind by rememberSaveable(original?.id) { mutableStateOf((original?.reminderDays ?: 2).toString()) }
    var rotate by rememberSaveable(original?.id) { mutableStateOf(original?.rotate ?: false) }
    var deleting by rememberSaveable(original?.id) { mutableStateOf(false) }
    var voice by remember { mutableStateOf<Voice?>(null) }
    var recording by remember { mutableStateOf(false) }
    val size = repeat.toIntOrNull() ?: -1
    val threshold = remind.toIntOrNull() ?: -1
    val validDate = date.isBlank() || runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)

    if (deleting && original != null) {
        AlertDialog(
            onDismissRequest = { if (!state.busy) deleting = false },
            title = { Text(stringResource(R.string.remove_entry)) },
            text = { Column { Text(original.title); Status(state) } },
            confirmButton = { TextButton(onClick = { model.remove(original) }, enabled = !state.busy) { Text(stringResource(R.string.remove_entry)) } },
            dismissButton = { TextButton(onClick = { deleting = false }, enabled = !state.busy) { Text(stringResource(R.string.cancel)) } }
        )
        return
    }

    AlertDialog(
        onDismissRequest = { if (!state.busy && !recording) model.edit(null) },
        title = { Text(stringResource(if (original != null) R.string.entry_details else if (task) R.string.add_task else R.string.add_event)) },
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                InputField(R.string.title, title, canEdit && !state.busy) { title = it.take(160) }
                InputField(R.string.date_format, date, canDate && !state.busy) { date = it.take(10) }
                SelectField(stringResource(R.string.category), category, categories.map { it.key to stringResource(it.value) }, canEdit && !state.busy) {
                    category = it
                }
                if (!task) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(allDay, { allDay = it }, enabled = canEdit && !state.busy)
                        Text(stringResource(R.string.event_all_day))
                    }
                    if (!allDay) {
                        OutlinedButton(
                            enabled = canEdit && !state.busy,
                            onClick = {
                                val parts = startTime.split(':')
                                android.app.TimePickerDialog(context, { _, hour, minute ->
                                    startTime = eventClock(hour * 60 + minute)
                                }, parts[0].toInt(), parts[1].toInt(), true).show()
                            }
                        ) { Text(stringResource(R.string.event_start, startTime)) }
                        InputField(R.string.event_duration, duration, canEdit && !state.busy, KeyboardType.Number) {
                            duration = it.filter { digit -> digit in '0'..'9' }.take(4)
                        }
                    }
                }
                if (task) {
                    SelectField(stringResource(R.string.member), assigned,
                        listOf(null to stringResource(R.string.unassigned)) + workspace.members.filterNot { it.inactive }.map { it.id to it.name },
                        canEdit && !state.busy) { assigned = it }
                    if (workspace.admin) InputField(R.string.reward_task_points, points, canEdit && !state.busy, KeyboardType.Number) {
                        points = it.filter { digit -> digit in '0'..'9' }.take(4)
                    }
                    InputField(R.string.task_estimated_minutes, estimate, canEdit && !state.busy, KeyboardType.Number) {
                        estimate = it.filter { digit -> digit in '0'..'9' }.take(4)
                    }
                    InputField(R.string.repeat_days, repeat, canEdit && !state.busy, KeyboardType.Number) { repeat = it.take(4) }
                    InputField(R.string.remind_days, remind, canEdit && !state.busy, KeyboardType.Number) { remind = it.take(2) }
                    if (size > 0) Row {
                        Checkbox(rotate, { rotate = it }, enabled = canEdit && !state.busy)
                        Text(stringResource(R.string.rotate_tasks))
                    }
                }
                if (!task && original?.dueOn != null) AddToPhoneCalendar(original)
                if (task && original != null) TaskDetailsPanel(original, state, model)
                if (original == null) VoiceAttachment(voice, !state.busy, { voice = it }, { recording = it })
                if (original?.voice != null) VoicePlayback(original.id, model)
                Status(state)
                if (open && task && original != null) {
                    if (original.assigneeId == null) TextButton(onClick = { model.taskAction(original.id, "claim") }, enabled = !state.busy) {
                        Text(stringResource(R.string.claim))
                    }
                    if (original.assigneeId == workspace.memberId) {
                        TextButton(onClick = { model.taskAction(original.id, "cover") }, enabled = !state.busy) { Text(stringResource(R.string.swap_notification)) }
                        TextButton(onClick = { model.taskAction(original.id, "complete") }, enabled = !state.busy) { Text(stringResource(R.string.complete)) }
                    }
                }
                if (open && workspace.permissions.remove && original != null) {
                    TextButton(onClick = { deleting = true }, enabled = !state.busy) { Text(stringResource(R.string.remove_entry)) }
                }
            }
        },
        confirmButton = {
            if (canEdit || canDate) TextButton(
                enabled = !state.busy && !recording && title.isNotBlank() && validDate && size in 0..3660 &&
                    threshold in 0..30 && (!task || points.isEmpty() || (points.toIntOrNull() ?: 0) in 1..1000) && (!task || estimate.isEmpty() || (estimate.toIntOrNull() ?: 0) in 1..1440) && (task || allDay || duration.isEmpty() || (duration.toIntOrNull() ?: 0) in 1..1440) &&
                    (date.isNotBlank() || (task && size == 0)),
                onClick = {
                    model.save(EntryInput(title.trim(), editor.kind, category, date.ifBlank { null }, assigned,
                        size, size > 0 && rotate, threshold, voice = voice,
                        allDay = if (task) null else allDay,
                        startTime = startTime.takeIf { !task && !allDay },
                        durationMinutes = duration.toIntOrNull()?.takeIf { !task && !allDay },
                        estimatedMinutes = estimate.toIntOrNull()?.takeIf { task },
                        points = points.toIntOrNull()?.takeIf { task }))
                }
            ) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { TextButton(onClick = { model.edit(null) }, enabled = !state.busy && !recording) { Text(stringResource(R.string.cancel)) } }
    )
}

@Composable
private fun InputField(label: Int, value: String, enabled: Boolean, type: KeyboardType = KeyboardType.Text, change: (String) -> Unit) {
    OutlinedTextField(
        value, change, label = { Text(stringResource(label)) }, singleLine = true,
        enabled = enabled, keyboardOptions = KeyboardOptions(keyboardType = type),
        modifier = Modifier.fillMaxWidth()
    )
}
