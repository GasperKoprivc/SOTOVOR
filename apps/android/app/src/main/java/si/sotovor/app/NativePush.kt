package si.sotovor.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@Singleton
class NativePush @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val api: SotovorApi,
    private val store: SessionStore
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val available = BuildConfig.FIREBASE_CONFIGURED

    fun start() {
        if (!available) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                channel("assignments", R.string.push_assignments),
                channel("reminders", R.string.push_reminders),
                channel("swaps", R.string.push_swaps),
                channel("shopping", R.string.shopping_title)
            )
        )
        scope.launch {
            store.sessions.map { it?.sessionId }.distinctUntilChanged().collect { if (it != null) requestToken() }
        }
    }

    private fun channel(id: String, name: Int) = NotificationChannel(id, context.getString(name), NotificationManager.IMPORTANCE_DEFAULT)

    fun requestToken() {
        if (!available || !permissionGranted(context)) return
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { register(it) }
        }
    }

    fun register(token: String) {
        if (!available || !permissionGranted(context)) return
        scope.launch {
            if (store.current() != null) {
                runCatching {
                    api.pushDevice(
                        PushDevice(
                            token,
                            "android",
                            BuildConfig.VERSION_NAME,
                            androidLocale(readAppearance(context).language).toLanguageTag(),
                            widgetRefresh = true
                        )
                    )
                }
            }
        }
    }
}

internal fun permissionGranted(context: Context) = (
    Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    ) &&
    NotificationManagerCompat.from(context).areNotificationsEnabled()

@AndroidEntryPoint
class SotovorMessaging : FirebaseMessagingService() {
    @Inject lateinit var push: NativePush

    override fun onNewToken(token: String) = push.register(token)

    override fun onMessageReceived(message: RemoteMessage) {
        TodayWidgetWork.refresh(this)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return
        val deepLink = message.data["deepLink"]
        if (parseNativeLink(deepLink) == null) return
        val id = (message.messageId ?: deepLink).hashCode()
        val intent = Intent(this, MainActivity::class.java).setData(Uri.parse(deepLink))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val channel = when (message.data["type"]) {
            "deadline", "overdue" -> "reminders"
            "swap" -> "swaps"
            "shopping" -> "shopping"
            else -> "assignments"
        }
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(message.data["body"] ?: message.notification?.body ?: getString(R.string.notifications))
            .setContentIntent(pending).setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(this).notify(id, notification)
    }
}
