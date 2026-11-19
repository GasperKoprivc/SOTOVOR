package si.sotovor.app

import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.serialization.Serializable

@Serializable data class Reward(val title: String, val points: Int)

@Serializable data class RewardScore(val id: String, val name: String, val points: Int)

@Serializable data class Rewards(val leaderboard: Boolean, val rewards: List<Reward>, val scores: List<RewardScore>)

@Serializable data class RewardSettings(val leaderboard: Boolean, val rewards: List<Reward>)

@Composable
fun RewardsPanel(workspace: Workspace, state: WorkspaceState, model: WorkspaceViewModel) {
    val data = state.rewards ?: return
    var title by rememberSaveable(workspace.household?.id) { mutableStateOf("") }
    var points by rememberSaveable(workspace.household?.id) { mutableStateOf("") }
    val amount = points.toIntOrNull() ?: 0
    SectionTitle(R.string.rewards_title)
    if (workspace.admin) {
        ToggleRow(R.string.rewards_leaderboard, data.leaderboard, !state.busy) {
            model.saveRewards(RewardSettings(it, data.rewards))
        }
    }
    data.scores.forEach { Text(stringResource(R.string.reward_points_for, it.name, it.points)) }
    data.rewards.forEachIndexed { index, reward ->
        Text(stringResource(R.string.reward_points_for, reward.title, reward.points))
        if (workspace.admin) {
            TextButton(enabled = !state.busy, onClick = {
                model.saveRewards(RewardSettings(data.leaderboard, data.rewards.filterIndexed { i, _ -> i != index }))
            }) { Text(stringResource(R.string.reward_remove)) }
        }
    }
    if (workspace.admin && data.rewards.size < 12) {
        Field(R.string.reward_name, title, { title = it.take(80) })
        Field(R.string.reward_threshold, points, { points = it.filter(Char::isDigit).take(6) }, KeyboardType.Number)
        OutlinedButton(enabled = !state.busy && title.isNotBlank() && amount in 1..100000, onClick = {
            model.saveRewards(RewardSettings(data.leaderboard, data.rewards + Reward(title.trim(), amount))) {
                title = ""
                points = ""
            }
        }) { Text(stringResource(R.string.reward_add)) }
    }
}
