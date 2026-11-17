package si.sotovor.app

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class SotovorApplication : Application() {
    @Inject lateinit var push: NativePush
    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.FIREBASE_CONFIGURED) Log.i("Sotovor", "Firebase push is disabled.")
        push.start()
    }
}
