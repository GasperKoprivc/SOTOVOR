package si.sotovor.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import java.time.ZoneId

val taskStates = linkedMapOf(
    "all" to R.string.open, "mine" to R.string.mine, "available" to R.string.available,
    "due" to R.string.due, "recurring" to R.string.recurring, "done" to R.string.done
)
val categories = linkedMapOf(
    "dom" to R.string.category_home, "druzina" to R.string.category_family, "opravki" to R.string.category_errands,
    "zdravje" to R.string.category_health, "drugo" to R.string.category_other
)
fun today(): LocalDate = LocalDate.now(ZoneId.of("Europe/Ljubljana"))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoreWorkspace(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel, push: NativePush) {
    val household = workspace.household ?: return
    val tabs = listOf(R.string.overview, R.string.tasks, R.string.calendar, R.string.workload, R.string.notifications, R.string.profile, R.string.shopping_tab)
    var tab by rememberSaveable(household.id) { mutableIntStateOf(0) }
    var requestedFilter by remember { mutableStateOf(TaskFilters()) }
    val incoming by model.links.collectAsStateWithLifecycle()
    LaunchedEffect(incoming, household.id) {
        when (val link = incoming) {
            is NativeLink.Invite -> tab = 5
            is NativeLink.Target -> {
                model.state.first { !it.busy }
                if (!link.shopping || household.id == link.household || workspace.spaces.none { it.id == link.household }) {
                    tab = if (link.shopping) 6 else if (link.entry == null) 5 else 1
                    model.openTarget(link)
                } else {
                    model.switchFamily(link.household)
                }
            }
            null -> Unit
        }
    }
    LaunchedEffect(tab, household.id) {
        model.state.first { !it.busy }
        when (tab) {
            1 -> model.tasks(requestedFilter)
            2 -> model.calendarSubscription()
            4 -> model.notifications()
            6 -> model.shopping()
        }
    }

    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        Text(household.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
            tabs.forEachIndexed { index, label ->
                Tab(selected = tab == index, onClick = { tab = index }, text = { Text(stringResource(label)) })
            }
        }
        PullToRefreshBox(isRefreshing = state.busy, onRefresh = {
            when (tab) {
                1 -> model.tasks(requestedFilter)
                4 -> model.notifications()
                6 -> model.shopping()
                else -> model.reload()
            }
        }, modifier = Modifier.weight(1f)) {
            when (tab) {
                0 -> DashboardPage(workspace, state, model) { filter ->
                    requestedFilter = TaskFilters(state = filter)
                    tab = 1
                }
                1 -> TasksPage(state, workspace, model, requestedFilter) {
                    requestedFilter = it
                    model.tasks(it)
                }
                2 -> CalendarPage(workspace, state, model)
                3 -> WorkloadPage(workspace, state, model)
                4 -> NotificationPage(state, model, push) { item ->
                    val target = workspace.entries.find { it.id == item.target.entryId }
                    if (target == null) tab = if (item.target.screen == "family") 5 else 1
                    else model.edit(EntryEditor(target.kind, target))
                }
                6 -> ShoppingPage(household.id, state, model, push)
                5 -> ProfilePage(workspace, state, model)
            }
        }
    }
    if (state.conflict) ConflictDialog(model::dismissConflict)
    else state.editor?.let { editor -> EntryDialog(editor, workspace, state, model) }
}

@Composable
fun SectionTitle(label: Int) = Text(stringResource(label), style = MaterialTheme.typography.headlineSmall)

@Composable
private fun DashboardPage(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel, filter: (String) -> Unit) {
    val open = workspace.entries.filter { it.kind == "task" && it.completedAt == null }
    val day = today()
    val week = day.minusDays((day.dayOfWeek.value - 1).toLong())
    val metrics = listOf(
        Triple(R.string.mine, open.count { it.assigneeId == workspace.memberId }, "mine"),
        Triple(R.string.available, open.count { it.assigneeId == null }, "available"),
        Triple(R.string.due, open.count { it.dueOn?.let { date -> date <= day.plusDays(it.reminderDays.toLong()).toString() } == true }, "due")
    )
    PanelScreen {
        Text(stringResource(R.string.greeting, workspace.profile.firstName), style = MaterialTheme.typography.headlineLarge)
        Status(state)
        metrics.forEach { (label, count, key) ->
            Card(onClick = { filter(key) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.metric, stringResource(label), count), modifier = Modifier.padding(16.dp))
            }
        }
        SectionTitle(R.string.tasks)
        open.sortedBy { it.dueOn ?: "9999-12-31" }.take(6).forEach { entry ->
            EntryCard(entry, workspace, model) { model.edit(EntryEditor(entry.kind, entry)) }
        }
        if (open.isEmpty()) Text(stringResource(R.string.no_tasks))
        SectionTitle(R.string.this_week)
        (0..6).forEach { index ->
            val date = week.plusDays(index.toLong())
            Text(stringResource(R.string.metric, date.toString(), workspace.entries.count { it.dueOn == date.toString() }))
        }
        SectionTitle(R.string.workload)
        WorkloadBars(workspace, 7)
    }
}

@Composable
private fun TasksPage(state: WorkspaceState, workspace: Workspace, model: WorkspaceViewModel,
                      filters: TaskFilters, onFilter: (TaskFilters) -> Unit) {
    var search by rememberSaveable(filters.state, filters.search) { mutableStateOf(filters.search) }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            SectionTitle(R.string.tasks)
            Status(state)
            if (workspace.permissions.create) Button(onClick = { model.edit(EntryEditor("task")) }) {
                Text(stringResource(R.string.add_task))
            }
            SelectField(stringResource(R.string.view), filters.state, taskStates.map { it.key to stringResource(it.value) }) {
                onFilter(filters.copy(state = it, search = search))
            }
            Field(R.string.search, search, { search = it.take(160) })
            SelectField(stringResource(R.string.category), filters.category,
                listOf(null to stringResource(R.string.all_categories)) + categories.map { it.key to stringResource(it.value) }) {
                onFilter(filters.copy(category = it, search = search))
            }
            SelectField(stringResource(R.string.member), filters.assignee,
                listOf(null to stringResource(R.string.all_members), "unassigned" to stringResource(R.string.unassigned)) +
                    workspace.members.filterNot { it.inactive }.map { it.id to it.name }) {
                onFilter(filters.copy(assignee = it, search = search))
            }
            TextButton(enabled = !state.busy, onClick = { onFilter(filters.copy(search = search)) }) { Text(stringResource(R.string.apply_filters)) }
            if (state.tasks.isEmpty() && !state.busy) Text(stringResource(R.string.no_tasks))
        }
        items(state.tasks, key = { it.id }) { entry ->
            EntryCard(entry, workspace, model) { model.edit(EntryEditor("task", entry)) }
        }
        if (state.taskCursor != null) item {
            OutlinedButton(onClick = { model.tasks(filters, more = true) }, enabled = !state.busy) {
                Text(stringResource(R.string.load_more))
            }
        }
    }
}

@Composable
fun EntryCard(entry: Entry, workspace: Workspace, model: WorkspaceViewModel? = null, open: () -> Unit) {
    val currentDate = today()
    val dueOn = entry.dueOn
    val state = when {
        entry.completedAt != null -> R.string.done
        entry.kind == "task" && dueOn != null && dueOn < currentDate.toString() -> R.string.overdue
        entry.kind == "task" && dueOn != null && dueOn <= currentDate.plusDays(entry.reminderDays.toLong()).toString() -> R.string.due
        else -> null
    }
    Card(Modifier.fillMaxWidth().clickable(onClick = open)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(entry.title, style = MaterialTheme.typography.titleMedium)
            val category = categories[entry.category]?.let { stringResource(it) }.orEmpty()
            val assignee = workspace.members.find { it.id == entry.assigneeId }?.name
                ?: if (entry.kind == "task") stringResource(R.string.unassigned) else ""
            Text(listOfNotNull(category, entry.dueOn, assignee,
                if (entry.kind == "event" && entry.startTime == null) stringResource(R.string.event_all_day) else null).filter { it.isNotBlank() }.joinToString(" · "))
            state?.let { Text(stringResource(it), color = MaterialTheme.colorScheme.tertiary) }
            if (entry.voice != null && model != null) VoicePlayback(entry.id, model)
        }
    }
}

private val notificationLabels = mapOf(
    "assignment" to R.string.assigned_notification, "deadline" to R.string.due, "overdue" to R.string.overdue,
    "swap" to R.string.swap_notification, "member_joined" to R.string.member_joined
)

@Composable
private fun NotificationPage(state: WorkspaceState, model: WorkspaceViewModel, push: NativePush, open: (Notice) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            SectionTitle(R.string.notifications)
            NotificationControls(state, model, push)
            Status(state)
            if (state.notifications.isEmpty() && !state.busy) Text(stringResource(R.string.no_notifications))
        }
        items(state.notifications, key = { it.id }) { entry ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(stringResource(notificationLabels[entry.type] ?: R.string.notifications), style = MaterialTheme.typography.titleMedium)
                    Text(entry.createdAt.take(10))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TextButton(onClick = {
                            if (entry.readAt == null) model.readNotice(entry)
                            open(entry)
                        }) { Text(stringResource(R.string.open_item)) }
                        if (entry.readAt == null) TextButton(onClick = { model.readNotice(entry) }) { Text(stringResource(R.string.mark_read)) }
                    }
                }
            }
        }
        if (state.noticeCursor != null) item {
            OutlinedButton(onClick = { model.notifications(more = true) }, enabled = !state.busy) { Text(stringResource(R.string.load_more)) }
        }
    }
}
