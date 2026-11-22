package si.sotovor.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import retrofit2.HttpException

data class WorkspaceState(
    val workspace: Workspace? = null,
    val busy: Boolean = true,
    val problem: String? = null,
    val problemResource: Int? = null,
    val notice: Int? = null,
    val tasks: List<Entry> = emptyList(),
    val taskCursor: String? = null,
    val filters: TaskFilters = TaskFilters(),
    val notifications: List<Notice> = emptyList(),
    val noticeCursor: String? = null,
    val devices: List<DeviceSession>? = null,
    val editor: EntryEditor? = null,
    val conflict: Boolean = false,
    val export: String? = null,
    val rewards: Rewards? = null,
    val taskDetails: TaskDetails? = null,
    val calendarSubscription: CalendarSubscription? = null,
    val shopping: List<ShoppingItem>? = null,
    val shoppingPush: Boolean? = null,
    val plan: PlanPreview? = null,
    val notificationSettings: NotificationSettings? = null
)

@HiltViewModel
class WorkspaceViewModel @Inject constructor(private val repository: FamilyRepository, private val json: Json) : ViewModel() {
    private val mutable = MutableStateFlow(WorkspaceState())
    val state = mutable.asStateFlow()
    private val navigation = MutableStateFlow<NativeLink?>(null)
    val links = navigation.asStateFlow()
    private val upgrade = MutableStateFlow(UpdateLevel.CURRENT)
    val updateLevel = upgrade.asStateFlow()

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
        navigation.value = null
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

    fun appearance(value: Appearance) = update {
        val saved = repository.saveAppearance(value)
        mutable.update { state ->
            state.copy(workspace = state.workspace?.let { it.copy(profile = it.profile.copy(appearance = saved)) })
        }
    }

    fun rewards() = update {
        val id = household() ?: return@update
        val rewards = repository.rewards(id)
        mutable.update { it.copy(rewards = rewards) }
    }

    fun saveRewards(settings: RewardSettings, saved: () -> Unit = {}) = update {
        val id = household() ?: return@update
        repository.saveRewards(id, settings)
        val rewards = repository.rewards(id)
        mutable.update { it.copy(rewards = rewards) }
        saved()
    }

    fun taskDetails() = updateDetails(repository::taskDetails)

    fun addCheck(title: String, saved: () -> Unit) = updateDetails { household, id ->
        repository.addCheck(household, id, title).also { saved() }
    }

    fun checkItem(item: String, checked: Boolean) = updateDetails { household, id ->
        repository.checkItem(household, id, item, checked)
    }

    fun addComment(text: String, saved: () -> Unit) = updateDetails { household, id ->
        repository.addComment(household, id, text).also { saved() }
    }

    private fun updateDetails(action: suspend (String, String) -> TaskDetails) = update {
        val household = household() ?: return@update
        val task = mutable.value.editor?.entry?.takeIf { it.kind == "task" } ?: return@update
        val details = action(household, task.id)
        mutable.update { if (it.editor?.entry?.id == task.id) it.copy(taskDetails = details) else it }
    }

    fun calendarSubscription() = update {
        val subscription = repository.calendarSubscription()
        mutable.update { it.copy(calendarSubscription = subscription) }
    }

    fun changeCalendarSubscription(revoke: Boolean) = update {
        val subscription = if (revoke) {
            repository.revokeCalendarSubscription()
        } else {
            repository.createCalendarSubscription(
                checkNotNull(household())
            )
        }
        mutable.update { it.copy(calendarSubscription = subscription) }
    }

    fun shopping() = update {
        val id = household() ?: return@update
        loadShopping(id)
        val push = repository.shoppingPush(id)
        mutable.update { it.copy(shoppingPush = push.enabled) }
    }

    private suspend fun loadShopping(id: String) {
        val items = repository.shopping(id)
        mutable.update { it.copy(shopping = items) }
    }

    fun addShopping(input: ShoppingInput, added: () -> Unit) = update {
        val id = household() ?: return@update
        repository.addShopping(id, input)
        added()
        loadShopping(id)
    }

    fun checkShopping(item: ShoppingItem, checked: Boolean) = update {
        val id = household() ?: return@update
        repository.checkShopping(id, item.id, checked)
        loadShopping(id)
    }

    fun removeShopping(item: ShoppingItem) = update {
        val id = household() ?: return@update
        repository.removeShopping(id, item.id)
        loadShopping(id)
    }

    fun saveShoppingPush(enabled: Boolean) = update {
        val id = household() ?: return@update
        val value = repository.saveShoppingPush(id, enabled)
        mutable.update { it.copy(shoppingPush = value.enabled) }
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

    fun edit(editor: EntryEditor?) = mutable.update { it.copy(editor = editor, conflict = false, taskDetails = null) }
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
            state.copy(
                editor = state.editor?.let { editor ->
                    state.workspace?.entries?.find { it.id == id && it.completedAt == null }?.let { editor.copy(entry = it) }
                }
            )
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
            state.copy(
                notifications = state.notifications.map {
                    if (it.id == notice.id) it.copy(readAt = java.time.Instant.now().toString()) else it
                }
            )
        }
    }

    fun devices() = update {
        mutable.update { it.copy(devices = null) }
        loadDevices()
    }
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

    fun checkVersion() {
        viewModelScope.launch {
            try {
                val versions = repository.versions()
                upgrade.value = upgradeLevel(BuildConfig.VERSION_NAME, versions.minSupported, versions.latest)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // The workspace still reports ordinary connectivity failures when the API is offline.
            }
        }
    }
    fun dismissUpdate() {
        if (upgrade.value == UpdateLevel.OPTIONAL) upgrade.value = UpdateLevel.CURRENT
    }
    fun receiveLink(raw: String?) {
        parseNativeLink(raw)?.let { navigation.value = it }
    }
    fun clearLink() {
        navigation.value = null
    }
    fun openTarget(target: NativeLink.Target) = update {
        if (mutable.value.workspace?.spaces?.none { it.id == target.household } != false) {
            mutable.update { it.copy(problemResource = R.string.space_unavailable) }
            navigation.value = null
            return@update
        }
        if (household() != target.household) {
            repository.switch(target.household)
            load()
        }
        navigation.value = null
        target.entry?.let { id ->
            val entry = repository.entry(target.household, id)
            edit(EntryEditor(entry.kind, entry))
        }
    }
    fun rotateInvite() = update {
        household()?.let { repository.rotateInvite(it) }
        load()
    }
    fun leaveRequest() = update {
        household()?.let { repository.leave(it) }
        load()
    }
    fun memberPlanning(id: String, value: PlanningMember) = update {
        household()?.let { repository.member(it, id, value) }
        load()
    }
    fun memberPermissions(id: String, value: Permissions) = update {
        household()?.let { repository.permissions(it, id, value) }
        load()
    }
    fun memberAction(id: String, action: String) = update {
        household()?.let { repository.memberAction(it, id, action) }
        load()
    }
    fun statisticsRange(days: Int, allowed: () -> Unit) = update {
        val scope = checkNotNull(household())
        repository.checkStatistics(scope, if (days == 0) "all" else days.toString())
        if (scope == household()) allowed()
    }

    fun clearPlan() = mutable.update { it.copy(plan = null) }
    fun preview(rebalance: Boolean) = update {
        val id = household() ?: return@update
        val plan = repository.preview(id, rebalance)
        mutable.update { it.copy(plan = plan) }
    }
    fun applyPlan(rebalance: Boolean) = update {
        val id = household() ?: return@update
        val plan = mutable.value.plan ?: return@update
        try {
            val result = repository.apply(id, rebalance, plan.signature)
            clearPlan()
            load()
            mutable.update {
                it.copy(notice = if (result.conflicts == 0) R.string.plan_applied else R.string.plan_some_conflicts)
            }
        } catch (error: HttpException) {
            if (error.code() != 409) throw error
            clearPlan()
            mutable.update { it.copy(problemResource = R.string.stale_plan) }
        }
    }
    fun loadNotificationSettings() = update {
        val settings = repository.settings()
        mutable.update { it.copy(notificationSettings = settings) }
    }
    fun saveNotificationSettings(value: NotificationSettings) = update {
        val settings = repository.saveSettings(value)
        mutable.update { it.copy(notificationSettings = settings) }
    }
    suspend fun transcribe(id: String) = repository.transcribe(checkNotNull(household()), id)
    suspend fun audio(id: String) = repository.downloadVoice(checkNotNull(household()), id)

    private suspend fun load() {
        val workspace = repository.workspace()
        mutable.update {
            if (it.workspace?.household?.id == workspace?.household?.id) {
                it.copy(workspace = workspace)
            } else {
                it.copy(
                    workspace = workspace, tasks = emptyList(), taskCursor = null, notifications = emptyList(),
                    noticeCursor = null, filters = TaskFilters(), editor = null, plan = null,
                    shopping = null, shoppingPush = null, rewards = null
                )
            }
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
                val detail = runCatching {
                    val body = error.response()?.errorBody()?.string() ?: return@runCatching null
                    json.decodeFromString<ApiError>(body).error
                }.getOrNull()
                val billingMessage = when (detail?.code) {
                    "PLAN_REQUIRED" -> R.string.plan_required
                    "BILLING_DISABLED" -> R.string.billing_disabled
                    "TRIAL_ALREADY_USED" -> R.string.trial_already_used
                    "INVALID_STATISTICS_RANGE" -> R.string.invalid_statistics_range
                    "PLANNING_PREVIEW_REQUIRED" -> R.string.planning_preview_required
                    else -> null
                }
                mutable.update {
                    it.copy(
                        problem = if (billingMessage != null) null else detail?.message,
                        problemResource = when {
                            billingMessage != null -> billingMessage
                            detail == null -> R.string.error_generic
                            else -> null
                        }
                    )
                }
            } catch (_: Exception) {
                mutable.update { it.copy(problemResource = R.string.error_generic) }
            } finally {
                mutable.update { it.copy(busy = false) }
            }
        }
    }
}
