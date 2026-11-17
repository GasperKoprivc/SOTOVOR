package si.sotovor.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject

data class WorkspaceState(
    val workspace: Workspace? = null, val busy: Boolean = true,
    val problem: String? = null, val problemResource: Int? = null, val notice: Int? = null
)

@HiltViewModel
class WorkspaceViewModel @Inject constructor(private val repository: FamilyRepository, private val json: Json) : ViewModel() {
    private val mutable = MutableStateFlow(WorkspaceState())
    val state = mutable.asStateFlow()

    init {
        viewModelScope.launch {
            repository.sessions.collect { credentials ->
                if (credentials == null) mutable.update { it.copy(workspace = null) }
            }
        }
        update(initial = true) { load() }
    }

    fun clearNotice() = mutable.update { it.copy(problem = null, problemResource = null, notice = null) }

    fun reload() = update { load() }
    fun signIn(email: String, password: String) = update {
        repository.login(email, password)
        load()
    }
    fun register(value: Registration) = update {
        repository.register(value)
        load()
    }
    fun createFamily(name: String, size: Int) = update {
        repository.create(name, size)
        load()
    }
    fun joinFamily(code: String) = update {
        repository.join(code)
        load()
    }
    fun switchFamily(id: String) = update {
        repository.switch(id)
        load()
    }
    fun resend() = update {
        repository.resend()
        mutable.update { it.copy(notice = R.string.verification_sent) }
    }
    fun signOut() = update {
        repository.logout()
        mutable.update { it.copy(workspace = null) }
    }

    private suspend fun load() {
        val workspace = repository.workspace()
        mutable.update { it.copy(workspace = workspace) }
    }

    private fun update(initial: Boolean = false, work: suspend () -> Unit) {
        if (!initial && mutable.value.busy) return
        mutable.update { it.copy(busy = true, problem = null, problemResource = null, notice = null) }
        viewModelScope.launch {
            try {
                work()
            } catch (error: CancellationException) {
                throw error
            } catch (_: IOException) {
                mutable.update { it.copy(problemResource = R.string.offline) }
            } catch (error: HttpException) {
                val message = runCatching {
                    val body = error.response()?.errorBody()?.string() ?: return@runCatching null
                    json.decodeFromString<ApiError>(body).error.message
                }.getOrNull()
                mutable.update { it.copy(problem = message, problemResource = if (message == null) R.string.error_generic else null) }
            } catch (_: Exception) {
                mutable.update { it.copy(problemResource = R.string.error_generic) }
            } finally {
                mutable.update { it.copy(busy = false) }
            }
        }
    }
}
