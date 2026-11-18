package si.sotovor.app

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import java.time.LocalDate

@Composable
fun AdminControls(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    var rotate by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val invite = workspace.household?.inviteCode
    if (invite != null) {
        SectionTitle(R.string.invite_members)
        SelectionContainer { Text(invite, style = MaterialTheme.typography.bodyLarge) }
        OutlinedButton(onClick = {
            val intent = Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, BuildConfig.PUBLIC_URL + "join/" + invite)
            context.startActivity(Intent.createChooser(intent, null))
        }) { Text(stringResource(R.string.share_invite)) }
        TextButton(onClick = { rotate = true }, enabled = !state.busy) { Text(stringResource(R.string.rotate_invite)) }
    }
    OutlinedButton(onClick = { expanded = !expanded }) { Text(stringResource(R.string.member_settings)) }
    if (expanded) {
        workspace.members.filterNot { it.inactive }.forEach { member ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(member.name, style = MaterialTheme.typography.titleMedium)
                    if (member.leaveRequested) Text(stringResource(R.string.leave_requested))
                    TextButton(onClick = {
                        selected = member.id
                        model.clearNotice()
                    }) { Text(stringResource(R.string.edit_member)) }
                }
            }
        }
    }
    if (rotate) {
        AlertDialog(
            onDismissRequest = { rotate = false },
            title = { Text(stringResource(R.string.rotate_invite)) },
            text = { Text(stringResource(R.string.rotate_invite_warning)) },
            confirmButton = {
                TextButton(onClick = {
                    rotate = false
                    model.rotateInvite()
                }) { Text(stringResource(R.string.rotate_invite)) }
            },
            dismissButton = { TextButton(onClick = { rotate = false }) { Text(stringResource(R.string.cancel)) } }
        )
    }
    workspace.members.find { !it.inactive && it.id == selected }?.let { member ->
        MemberEditor(member, state, model) { selected = null }
    }
}

private val roles = listOf(
    "father" to R.string.father,
    "mother" to R.string.mother,
    "guardian" to R.string.guardian,
    "child" to R.string.child,
    "other" to R.string.category_other
)
private val availabilityOptions = listOf(
    "available" to R.string.member_available,
    "sick" to R.string.member_sick,
    "unavailable" to R.string.member_away
)

@Composable
private fun MemberEditor(member: Member, state: WorkspaceState, model: WorkspaceViewModel, close: () -> Unit) {
    var role by rememberSaveable(member.id, member.familyRole) { mutableStateOf(member.familyRole) }
    var availability by rememberSaveable(member.id, member.availability) { mutableStateOf(member.availability ?: "available") }
    var until by rememberSaveable(member.id, member.unavailableUntil) { mutableStateOf(member.unavailableUntil.orEmpty()) }
    var permissions by remember(member.id, member.permissions) { mutableStateOf(member.permissions ?: Permissions()) }
    var removal by rememberSaveable(member.id) { mutableStateOf(false) }
    val valid = until.isBlank() || runCatching { LocalDate.parse(until).toString() == until }.getOrDefault(false)
    AlertDialog(
        onDismissRequest = { if (!state.busy) close() },
        title = { Text(member.name) },
        text = {
            Column(
                Modifier.heightIn(max = 490.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                SelectField(stringResource(R.string.family_role), role, roles.map { it.first to stringResource(it.second) }, !state.busy) {
                    role =
                        it
                }
                SelectField(
                    stringResource(R.string.availability),
                    availability,
                    availabilityOptions.map { it.first to stringResource(it.second) },
                    !state.busy
                ) { availability = it }
                if (availability != "available") Field(R.string.until, until, { until = it.take(10) })
                TextButton(onClick = {
                    model.memberPlanning(
                        member.id,
                        PlanningMember(
                            role,
                            availability,
                            until.takeUnless {
                                availability == "available" ||
                                    it.isBlank()
                            }
                        )
                    )
                }, enabled = !state.busy && valid) { Text(stringResource(R.string.save_availability)) }

                if (!member.admin) {
                    ToggleRow(R.string.permission_create, permissions.create, !state.busy) { permissions = permissions.copy(create = it) }
                    ToggleRow(R.string.permission_edit, permissions.edit, !state.busy) { permissions = permissions.copy(edit = it) }
                    ToggleRow(R.string.permission_move, permissions.move, !state.busy) { permissions = permissions.copy(move = it) }
                    ToggleRow(R.string.permission_remove, permissions.remove, !state.busy) { permissions = permissions.copy(remove = it) }
                    TextButton(onClick = { model.memberPermissions(member.id, permissions) }, enabled = !state.busy) {
                        Text(stringResource(R.string.save_permissions))
                    }
                    if (member.leaveRequested) {
                        TextButton(onClick = { model.memberAction(member.id, "deny") }, enabled = !state.busy) {
                            Text(stringResource(R.string.deny_leave))
                        }
                    }
                    TextButton(onClick = { removal = true }, enabled = !state.busy) {
                        Text(stringResource(if (member.leaveRequested) R.string.approve_leave else R.string.remove_member))
                    }
                    if (removal) {
                        Text(stringResource(R.string.confirm_remove_member))
                        TextButton(onClick = {
                            model.memberAction(member.id, "remove")
                            removal = false
                        }, enabled = !state.busy) { Text(stringResource(R.string.confirm)) }
                    }
                }
                Status(state)
            }
        },
        confirmButton = { TextButton(onClick = close, enabled = !state.busy) { Text(stringResource(R.string.back)) } }
    )
}

@Composable
fun ToggleRow(label: Int, value: Boolean, enabled: Boolean, change: (Boolean) -> Unit) {
    Row {
        Checkbox(value, change, enabled = enabled)
        Text(stringResource(label), Modifier.padding(top = 12.dp))
    }
}

@Composable
fun SmartPlan(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    if (!workspace.admin) return
    var rebalance by rememberSaveable(workspace.household?.id) { mutableStateOf(false) }
    SectionTitle(R.string.smart_planning)
    Text(stringResource(R.string.plan_weighted_minutes))
    ToggleRow(R.string.rebalance, rebalance, !state.busy) {
        rebalance = it
        model.clearPlan()
    }
    OutlinedButton(onClick = { model.preview(rebalance) }, enabled = !state.busy) { Text(stringResource(R.string.prepare_plan)) }
    state.plan?.let { plan ->
        Text(stringResource(R.string.plan_until, plan.until))
        plan.changes.forEach { change -> Text("${change.title} → ${change.assigneeName}") }
        Text(stringResource(R.string.plan_skipped, plan.skipped))
        if (plan.changes.isNotEmpty()) {
            Button(onClick = { model.applyPlan(rebalance) }, enabled = !state.busy) {
                Text(stringResource(R.string.apply_plan))
            }
        }
    }
    Status(state)
}
