package si.sotovor.app

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@HiltAndroidApp
class SotovorApplication : Application() {
    @Inject lateinit var push: NativePush

    @Inject lateinit var repository: FamilyRepository
    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.FIREBASE_CONFIGURED) Log.i("Sotovor", "Firebase push is disabled.")
        push.start()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            repository.sessions.map { it?.sessionId }.distinctUntilChanged().collect { TodayWidgetWork.refresh(this@SotovorApplication) }
        }
    }
}
