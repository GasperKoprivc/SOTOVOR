package si.sotovor.app

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class SotovorApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.FIREBASE_CONFIGURED) Log.i("Sotovor", "Firebase push is disabled.")
    }
}
