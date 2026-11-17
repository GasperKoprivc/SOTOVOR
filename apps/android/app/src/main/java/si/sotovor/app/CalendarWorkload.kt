package si.sotovor.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun CalendarPage(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    var selected by rememberSaveable { mutableStateOf(today().toString()) }
    var monthly by rememberSaveable { mutableStateOf(true) }
    val day = LocalDate.parse(selected)
    val start = if (monthly) day.withDayOfMonth(1) else day
    val monday = start.minusDays((start.dayOfWeek.value - 1).toLong())
    val rows = if (monthly) (start.dayOfWeek.value + day.lengthOfMonth() + 5) / 7 else 1
    fun shift(offset: Long) {
        selected = (if (monthly) day.plusMonths(offset) else day.plusWeeks(offset)).toString()
    }
    PanelScreen {
        SectionTitle(R.string.calendar)
        Status(state)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(monthly, { monthly = true }, { Text(stringResource(R.string.month)) })
            FilterChip(!monthly, { monthly = false }, { Text(stringResource(R.string.week)) })
        }
        Text(day.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.getDefault())), style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { shift(-1) }) { Text(stringResource(R.string.previous)) }
            TextButton(onClick = { selected = today().toString() }) { Text(stringResource(R.string.today)) }
            TextButton(onClick = { shift(1) }) { Text(stringResource(R.string.next)) }
        }
        Row(Modifier.fillMaxWidth()) {
            repeat(7) { index ->
                Text(monday.plusDays(index.toLong()).format(DateTimeFormatter.ofPattern("EEEEE", Locale.getDefault())),
                    modifier = Modifier.weight(1f))
            }
        }
        repeat(rows) { row ->
            Row(Modifier.fillMaxWidth()) {
                repeat(7) { column ->
                    val date = monday.plusDays((row * 7 + column).toLong())
                    val hasItem = workspace.entries.any { it.dueOn == date.toString() }
                    val description = date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL))
                    TextButton(
                        onClick = { selected = date.toString() },
                        modifier = Modifier.weight(1f).sizeIn(minHeight = 48.dp).semantics { contentDescription = description }
                    ) {
                        Text(date.dayOfMonth.toString() + if (hasItem) "•" else "",
                            color = if (date == day) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        Text(day.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)), style = MaterialTheme.typography.titleLarge)
        if (workspace.permissions.create) {
            OutlinedButton(onClick = { model.edit(EntryEditor("event", day = selected)) }) { Text(stringResource(R.string.add_event)) }
            OutlinedButton(onClick = { model.edit(EntryEditor("task", day = selected)) }) { Text(stringResource(R.string.add_task)) }
        }
        val matches = workspace.entries.filter { it.dueOn == selected }
        if (matches.isEmpty()) Text(stringResource(R.string.no_entries))
        matches.forEach { EntryCard(it, workspace) { model.edit(EntryEditor(it.kind, it)) } }
    }
}

@Composable
fun WorkloadPage(workspace: Workspace) {
    var days by rememberSaveable { mutableIntStateOf(30) }
    PanelScreen {
        SectionTitle(R.string.workload)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(7 to R.string.days_7, 30 to R.string.days_30, 0 to R.string.all_time).forEach { (number, label) ->
                FilterChip(days == number, { days = number }, { Text(stringResource(label)) })
            }
        }
        WorkloadBars(workspace, days)
    }
}

internal data class WorkloadRow(val name: String, val open: Int, val completed: Int)
internal fun calculateWorkload(workspace: Workspace, days: Int, now: Instant): List<WorkloadRow> {
    val since = if (days == 0) Instant.MIN else now.minus(days.toLong(), ChronoUnit.DAYS)
    return workspace.members.filterNot { it.inactive }.map { member ->
        val tasks = workspace.entries.filter { it.kind == "task" && it.assigneeId == member.id }
        WorkloadRow(member.name, tasks.count { it.completedAt == null }, tasks.count { entry ->
            entry.completedAt?.let { runCatching { !Instant.parse(it).isBefore(since) }.getOrDefault(false) } ?: false
        })
    }
}

@Composable
fun WorkloadBars(workspace: Workspace, days: Int) {
    val rows = calculateWorkload(workspace, days, Instant.now())
    val maximum = (rows.maxOfOrNull { it.open + it.completed } ?: 1).coerceAtLeast(1)
    rows.forEach {
        Text(it.name, style = MaterialTheme.typography.titleMedium)
        LinearProgressIndicator(progress = { (it.open + it.completed).toFloat() / maximum }, modifier = Modifier.fillMaxWidth())
        Text(stringResource(R.string.workload_counts, it.open, it.completed))
    }
}
