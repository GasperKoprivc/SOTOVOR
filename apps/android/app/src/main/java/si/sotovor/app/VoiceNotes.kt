package si.sotovor.app

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val AUDIO_LIMIT = 2 * 1024 * 1024
private data class Recording(val recorder: MediaRecorder, val file: File)
private data class Playback(val player: MediaPlayer, val file: File)

@Composable
fun VoiceAttachment(value: Voice?, enabled: Boolean, onChange: (Voice?) -> Unit, onRecording: (Boolean) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var recording by remember { mutableStateOf<Recording?>(null) }
    var handling by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<Int?>(null) }

    fun finish() {
        val current = recording ?: return
        recording = null
        handling = true
        val stopped = runCatching { current.recorder.stop() }.isSuccess
        current.recorder.release()
        scope.launch {
            try {
                val attachment = withContext(Dispatchers.IO) {
                    if (!stopped || current.file.length() !in 1L..AUDIO_LIMIT.toLong()) {
                        null
                    } else {
                        Voice("audio/mp4", Base64.encodeToString(current.file.readBytes(), Base64.NO_WRAP))
                    }
                }
                if (attachment == null) error = R.string.voice_failed else onChange(attachment)
            } finally {
                current.file.delete()
                handling = false
                onRecording(false)
            }
        }
    }

    @Suppress("DEPRECATION")
    fun start() {
        error = null
        val recorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        val file = runCatching { File.createTempFile("recording-", ".m4a", context.cacheDir) }.getOrElse {
            recorder.release()
            error = R.string.voice_failed
            return
        }
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioSamplingRate(44_100)
            recorder.setAudioEncodingBitRate(64_000)
            recorder.setMaxDuration(30_000)
            recorder.setMaxFileSize(AUDIO_LIMIT.toLong())
            recorder.setOutputFile(file.absolutePath)
            recorder.setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED ||
                    what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED
                ) {
                    finish()
                }
            }
            recorder.setOnErrorListener { _, _, _ ->
                finish()
                error = R.string.voice_failed
            }
            recorder.prepare()
            recorder.start()
            recording = Recording(recorder, file)
            onRecording(true)
        } catch (_: Exception) {
            recorder.release()
            file.delete()
            error = R.string.voice_failed
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) start() else error = R.string.microphone_denied
    }
    DisposableEffect(Unit) {
        onDispose {
            recording?.let { current ->
                current.recorder.release()
                current.file.delete()
            }
        }
    }
    Text(stringResource(R.string.voice_hint))
    when {
        recording != null -> TextButton(onClick = ::finish) { Text(stringResource(R.string.stop_recording)) }
        handling -> Text(stringResource(R.string.saving_recording))
        value != null -> TextButton(onClick = { onChange(null) }, enabled = enabled) { Text(stringResource(R.string.remove_recording)) }
        else -> TextButton(enabled = enabled, onClick = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                start()
            } else {
                permission.launch(Manifest.permission.RECORD_AUDIO)
            }
        }) { Text(stringResource(R.string.record_voice)) }
    }
    error?.let { Text(stringResource(it)) }
}

@Composable
fun VoicePlayback(id: String, model: WorkspaceViewModel) {
    val scope = rememberCoroutineScope()
    var active by remember(id) { mutableStateOf<Playback?>(null) }
    var loading by remember(id) { mutableStateOf(false) }
    var failure by remember(id) { mutableStateOf(false) }
    fun release() {
        active?.let {
            it.player.release()
            it.file.delete()
        }
        active = null
    }
    DisposableEffect(id) { onDispose { release() } }

    TextButton(enabled = !loading, onClick = {
        if (active != null) {
            release()
        } else {
            loading = true
            failure = false
            scope.launch {
                try {
                    val file = model.audio(id)
                    val player = MediaPlayer()
                    active = Playback(player, file)
                    player.setDataSource(file.absolutePath)
                    player.setOnPreparedListener { it.start() }
                    player.setOnCompletionListener { release() }
                    player.setOnErrorListener { _, _, _ ->
                        failure = true
                        release()
                        true
                    }
                    player.prepareAsync()
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    release()
                    failure = true
                } finally {
                    loading = false
                }
            }
        }
    }) { Text(stringResource(if (active != null) R.string.stop_playback else R.string.play_voice)) }
    if (failure) Text(stringResource(R.string.voice_failed))
}
