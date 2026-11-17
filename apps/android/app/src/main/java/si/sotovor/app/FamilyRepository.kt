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
            api.dashboard(selected)
        } catch (error: HttpException) {
            if (selected == null || error.code() != 403) throw error
            context.settings.edit { it.remove(activeHousehold) }
            api.dashboard(null)
        }
    }

    suspend fun switch(id: String) = context.settings.edit { it[activeHousehold] = id }
    suspend fun create(name: String, members: Int) = switch(api.createFamily(NewFamily(name, members)).householdId)
    suspend fun join(invite: String) = switch(api.joinFamily(Invitation(invite.trim())).householdId)
    suspend fun resend() = api.resend()

    suspend fun logout() = withContext(Dispatchers.IO) {
        val stored = store.current()
        try {
            if (stored != null) api.logout()
        } catch (error: HttpException) {
            if (error.code() != 401) throw error
        }
        store.replace(store.current(), null)
        context.settings.edit { it.remove(activeHousehold) }
    }
}
