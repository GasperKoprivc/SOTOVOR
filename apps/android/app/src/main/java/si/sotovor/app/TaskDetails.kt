package si.sotovor.app

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable

@Serializable
data class ChecklistItem(val id: String, val title: String, val checked: Boolean)

@Serializable
data class TaskComment(val id: String, val authorName: String, val text: String, val createdAt: String)

@Serializable
data class TaskDetails(val checklist: List<ChecklistItem>, val comments: List<TaskComment>)

@Serializable data class ChecklistInput(val title: String)
@Serializable data class ChecklistCheck(val checked: Boolean)
@Serializable data class CommentInput(val text: String)

@Composable
fun TaskDetailsPanel(task: Entry, state: WorkspaceState, model: WorkspaceViewModel) {
    var title by rememberSaveable(task.id) { mutableStateOf("") }
    var comment by rememberSaveable(task.id) { mutableStateOf("") }
    LaunchedEffect(task.id) {
        model.state.first { !it.busy }
        model.taskDetails()
    }
    val details = state.taskDetails ?: return
    val open = task.completedAt == null
    Text(stringResource(R.string.task_checklist), style = MaterialTheme.typography.titleMedium)
    details.checklist.forEach { item ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(item.checked, { model.checkItem(item.id, it) }, enabled = open && !state.busy,
                modifier = Modifier.semantics { contentDescription = item.title })
            Text(item.title)
        }
    }
    if (open) {
        Field(R.string.task_new_check, title, { title = it.take(160) })
        OutlinedButton(enabled = !state.busy && title.isNotBlank(), onClick = {
            model.addCheck(title.trim()) { title = "" }
        }) { Text(stringResource(R.string.task_add_check)) }
    }
    Text(stringResource(R.string.task_comments), style = MaterialTheme.typography.titleMedium)
    details.comments.forEach {
        Text(it.authorName, style = MaterialTheme.typography.labelLarge)
        Text(it.text)
    }
    Field(R.string.task_your_comment, comment, { comment = it.take(500) })
    OutlinedButton(enabled = !state.busy && comment.isNotBlank(), onClick = {
        model.addComment(comment.trim()) { comment = "" }
    }) { Text(stringResource(R.string.task_add_comment)) }
}
