package si.sotovor.app

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.io.File
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

private val Context.settings by preferencesDataStore("sotovor-settings")
private val activeHousehold = stringPreferencesKey("active_household")

@Singleton
class FamilyRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: SotovorApi,
    @Named("public") private val publicApi: SotovorApi,
    private val store: SessionStore
) {
    val sessions = store.sessions

    suspend fun login(email: String, password: String) = withContext(Dispatchers.IO) {
        val credentials = publicApi.login(Login(email.trim(), password, Build.MODEL.take(80).ifBlank { "Android" }))
        store.replace(store.current(), credentials)
        context.settings.edit { it.remove(activeHousehold) }
    }

    suspend fun register(registration: Registration) {
        publicApi.register(registration)
        login(registration.email, registration.password)
    }

    suspend fun workspace(): Workspace? = withContext(Dispatchers.IO) {
        if (store.current() == null) return@withContext null
        val selected = context.settings.data.first()[activeHousehold]
        try {
            api.dashboard(selected, includeEntries = true)
        } catch (error: HttpException) {
            if (selected == null || error.code() != 403) throw error
            context.settings.edit { it.remove(activeHousehold) }
            api.dashboard(null, includeEntries = true)
        }
    }

    suspend fun switch(id: String) = context.settings.edit { it[activeHousehold] = id }
    suspend fun create(name: String, members: Int) = switch(api.createFamily(NewFamily(name, members)).householdId)
    suspend fun join(invite: String) = switch(api.joinFamily(Invitation(invite.trim())).householdId)
    suspend fun resend() = api.resend()
    suspend fun shopping(id: String) = api.shopping(id)
    suspend fun shoppingPush(id: String) = api.shoppingPush(id)
    suspend fun addShopping(id: String, input: ShoppingInput) = api.addShopping(id, input)
    suspend fun checkShopping(id: String, item: String, checked: Boolean) = api.checkShopping(id, item, ShoppingCheck(checked))
    suspend fun removeShopping(id: String, item: String) = api.removeShopping(id, item)
    suspend fun saveShoppingPush(id: String, enabled: Boolean) = api.saveShoppingPush(id, ShoppingPush(enabled))
    suspend fun tasks(household: String, filters: TaskFilters, cursor: String?) =
        api.tasks(household, filters.state, filters.search.trim().takeIf { it.isNotEmpty() }, filters.category, filters.assignee, cursor)

    suspend fun save(household: String, editor: EntryEditor, input: EntryInput) {
        val entry = editor.entry
        if (entry == null) api.createEntry(household, input)
        else api.editEntry(household, entry.id, input.copy(version = entry.version))
    }

    suspend fun remove(household: String, entry: Entry) = api.removeEntry(household, entry.id, Version(entry.version))
    suspend fun act(household: String, id: String, action: String) = api.taskAction(household, id, action)
    suspend fun notices(household: String, cursor: String?) = api.notices(household, cursor)
    suspend fun readNotice(household: String, id: String) = api.readNotice(household, id)
    suspend fun devices() = api.sessions()
    suspend fun revoke(device: DeviceSession) {
        api.revoke(device.id)
        if (device.current) clearLocalSession()
    }
    suspend fun export() = withContext(Dispatchers.IO) { api.export().use { it.string() } }
    suspend fun deleteAccount(input: DeleteAccount) {
        api.deleteAccount(input)
        clearLocalSession()
    }
    suspend fun versions() = publicApi.versions()
    suspend fun entry(household: String, id: String) = api.entry(household, id)
    suspend fun rotateInvite(household: String) = api.rotateInvite(household)
    suspend fun leave(household: String) = api.leave(household)
    suspend fun member(household: String, id: String, value: PlanningMember) = api.member(household, id, value)
    suspend fun permissions(household: String, id: String, value: Permissions) = api.permissions(household, id, value)
    suspend fun memberAction(household: String, id: String, action: String) = api.memberAction(household, id, action)
    suspend fun preview(household: String, rebalance: Boolean) = api.preview(household, PlanRequest(rebalance))
    suspend fun apply(household: String, rebalance: Boolean, signature: String) = api.apply(household, PlanRequest(rebalance, signature))
    suspend fun settings() = api.settings()
    suspend fun saveSettings(value: NotificationSettings) = api.saveSettings(value)

    suspend fun downloadVoice(household: String, id: String): File = withContext(Dispatchers.IO) {
        val output = File.createTempFile("voice-", ".audio", context.cacheDir)
        try {
            api.voice(household, id).use { body ->
                output.outputStream().use { target ->
                    val stream = body.byteStream()
                    val buffer = ByteArray(8192)
                    var total = 0
                    while (true) {
                        val count = stream.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > 2 * 1024 * 1024) throw java.io.IOException("Invalid voice file size")
                        target.write(buffer, 0, count)
                    }
                    if (total == 0) throw java.io.IOException("Empty voice file")
                }
            }
            output
        } catch (error: Exception) {
            output.delete()
            throw error
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val stored = store.current()
        try {
            if (stored != null) api.logout()
        } catch (error: HttpException) {
            if (error.code() != 401) throw error
        }
        clearLocalSession()
    }

    private suspend fun clearLocalSession() = withContext(Dispatchers.IO) {
        store.replace(store.current(), null)
        context.settings.edit { it.remove(activeHousehold) }
    }
}
