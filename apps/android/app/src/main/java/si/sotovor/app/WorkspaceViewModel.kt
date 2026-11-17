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
    val problem: String? = null, val problemResource: Int? = null, val notice: Int? = null,
    val tasks: List<Entry> = emptyList(), val taskCursor: String? = null, val filters: TaskFilters = TaskFilters(),
    val notifications: List<Notice> = emptyList(), val noticeCursor: String? = null, val devices: List<DeviceSession>? = null,
    val editor: EntryEditor? = null, val conflict: Boolean = false, val export: String? = null
)

@HiltViewModel
class WorkspaceViewModel @Inject constructor(private val repository: FamilyRepository, private val json: Json) : ViewModel() {
    private val mutable = MutableStateFlow(WorkspaceState())
    val state = mutable.asStateFlow()

    init {
        viewModelScope.launch {
            repository.sessions.collect { credentials ->
                if (credentials == null) mutable.update { WorkspaceState(busy = it.busy) }
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

    fun tasks(filters: TaskFilters, more: Boolean = false) = update {
        loadTasks(filters, more)
    }

    private suspend fun loadTasks(filters: TaskFilters, more: Boolean = false) {
        val snapshot = mutable.value
        val household = snapshot.workspace?.household?.id ?: return
        val result = repository.tasks(household, filters, if (more) snapshot.taskCursor else null)
        mutable.update {
            it.copy(filters = filters, tasks = if (more) it.tasks + result.items else result.items, taskCursor = result.nextCursor)
        }
    }

    fun edit(editor: EntryEditor?) = mutable.update { it.copy(editor = editor, conflict = false) }
    fun dismissConflict() {
        edit(null)
        reload()
    }

    fun save(input: EntryInput) = update {
        val id = household() ?: return@update
        val editor = mutable.value.editor ?: return@update
        try {
            repository.save(id, editor, input)
        } catch (error: HttpException) {
            if (error.code() != 409) throw error
            mutable.update { it.copy(conflict = true) }
            return@update
        }
        edit(null)
        load()
        loadTasks(mutable.value.filters)
    }

    fun remove(entry: Entry) = update {
        val id = household() ?: return@update
        try {
            repository.remove(id, entry)
        } catch (error: HttpException) {
            if (error.code() != 409) throw error
            mutable.update { it.copy(conflict = true) }
            return@update
        }
        edit(null)
        load()
        loadTasks(mutable.value.filters)
    }

    fun taskAction(id: String, action: String) = update {
        val household = household() ?: return@update
        repository.act(household, id, action)
        load()
        loadTasks(mutable.value.filters)
        mutable.update { state ->
            state.copy(editor = state.editor?.let { editor ->
                state.workspace?.entries?.find { it.id == id && it.completedAt == null }?.let { editor.copy(entry = it) }
            })
        }
    }

    fun notifications(more: Boolean = false) = update { loadNotices(more) }
    private suspend fun loadNotices(more: Boolean = false) {
        val id = household() ?: return
        val result = repository.notices(id, if (more) mutable.value.noticeCursor else null)
        mutable.update {
            it.copy(notifications = if (more) it.notifications + result.items else result.items, noticeCursor = result.nextCursor)
        }
    }

    fun readNotice(notice: Notice) = update {
        repository.readNotice(notice.target.householdId, notice.id)
        mutable.update { state ->
            state.copy(notifications = state.notifications.map {
                if (it.id == notice.id) it.copy(readAt = java.time.Instant.now().toString()) else it
            })
        }
    }

    fun devices() = update { mutable.update { it.copy(devices = null) }; loadDevices() }
    private suspend fun loadDevices() {
        val items = repository.devices()
        mutable.update { it.copy(devices = items) }
    }
    fun revoke(device: DeviceSession) = update {
        repository.revoke(device)
        if (!device.current) loadDevices()
    }
    fun export() = update {
        val data = repository.export()
        mutable.update { it.copy(export = data) }
    }
    fun consumeExport() = mutable.update { it.copy(export = null) }
    fun deleteAccount(input: DeleteAccount) = update { repository.deleteAccount(input) }
    private fun household() = mutable.value.workspace?.household?.id

    private suspend fun load() {
        val workspace = repository.workspace()
        mutable.update {
            if (it.workspace?.household?.id == workspace?.household?.id) it.copy(workspace = workspace)
            else it.copy(workspace = workspace, tasks = emptyList(), taskCursor = null, notifications = emptyList(),
                noticeCursor = null, filters = TaskFilters(), editor = null)
        }
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
