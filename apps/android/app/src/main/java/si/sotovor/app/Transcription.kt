package si.sotovor.app

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable data class VoiceTranscript(val text: String)

@Composable
fun TranscriptionPanel(entry: String, model: WorkspaceViewModel) {
    var expanded by rememberSaveable(entry) { mutableStateOf(false) }
    var busy by remember(entry) { mutableStateOf(false) }
    var problem by remember(entry) { mutableStateOf(false) }
    var transcript by remember(entry) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    if (!expanded) {
        TextButton(onClick = { expanded = true }) { Text(stringResource(R.string.transcription_title)) }
        return
    }
    Text(stringResource(R.string.transcription_privacy))
    TextButton(enabled = !busy, onClick = {
        busy = true
        problem = false
        scope.launch {
            try {
                transcript = model.transcribe(entry).text
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                problem = true
            } finally {
                busy = false
            }
        }
    }) { Text(stringResource(if (busy) R.string.transcription_working else R.string.transcription_submit)) }
    if (problem) Text(stringResource(R.string.transcription_failed))
    transcript?.let { value ->
        SelectionContainer { Text(value.ifBlank { stringResource(R.string.transcription_empty) }) }
    }
}
