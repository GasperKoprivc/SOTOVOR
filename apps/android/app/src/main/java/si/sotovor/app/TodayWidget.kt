package si.sotovor.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException

@Serializable data class WidgetTask(val id: String, val title: String)

@Serializable data class WidgetTasks(val householdId: String, val tasks: List<WidgetTask>)

private val widgetSnapshot = stringPreferencesKey("today_snapshot")
private val householdKey = ActionParameters.Key<String>("household")
private val taskKey = ActionParameters.Key<String>("task")

class TodayWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val snapshot = currentState<Preferences>()[widgetSnapshot]?.let {
                runCatching { Json.decodeFromString<WidgetTasks>(it) }.getOrNull()
            }
            TodayWidgetContent(snapshot)
        }
    }
}

@Composable
private fun TodayWidgetContent(snapshot: WidgetTasks?) {
    val base = LocalContext.current
    val appearance = readAppearance(base)
    val context = appearanceContext(base, appearance.language)
    val dark = when (appearance.theme) {
        "light" -> false
        "system" -> context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        else -> true
    }
    val ink = ColorProvider(if (dark) Color(0xFFFDF5EC) else Color(0xFF192B2A))
    val heading = TextStyle(color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    val text = TextStyle(color = ink, fontSize = 13.sp)
    val background = if (dark) Color(0xFF1D3836) else Color(0xFFF6F4EE)
    Column(GlanceModifier.fillMaxSize().background(background).padding(12.dp)) {
        Text(
            context.getString(R.string.widget_title),
            style = heading,
            modifier = GlanceModifier.height(64.dp).clickable(actionStartActivity<MainActivity>())
        )
        if (snapshot == null || snapshot.tasks.isEmpty()) {
            Text(
                context.getString(if (snapshot == null) R.string.widget_open else R.string.widget_empty),
                style = text,
                modifier = GlanceModifier.height(64.dp).padding(top = 8.dp).clickable(actionStartActivity<MainActivity>())
            )
        }
        snapshot?.tasks?.take(3)?.forEach { task ->
            val link = "sotovor://task?householdId=${snapshot.householdId}&entryId=${task.id}"
            val open = actionStartActivity<MainActivity>(actionParametersOf(ActionParameters.Key<String>("deepLink") to link))
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    task.title,
                    style = text,
                    maxLines = 1,
                    modifier = GlanceModifier.defaultWeight().height(48.dp).clickable(open).padding(vertical = 8.dp)
                )
                Text(
                    context.getString(R.string.widget_done),
                    style = text,
                    modifier = GlanceModifier.height(48.dp).clickable(
                        actionRunCallback<CompleteWidgetTask>(
                            actionParametersOf(householdKey to snapshot.householdId, taskKey to task.id)
                        )
                    ).padding(8.dp)
                )
            }
        }
    }
}

class CompleteWidgetTask : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val household = parameters[householdKey] ?: return
        val task = parameters[taskKey] ?: return
        TodayWidgetWork.complete(context, household, task)
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = TodayWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        TodayWidgetWork.enable(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        TodayWidgetWork.disable(context)
    }
}

object TodayWidgetWork {
    fun enable(context: Context) {
        val periodic = PeriodicWorkRequestBuilder<TodayWidgetWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("today-widget-periodic", ExistingPeriodicWorkPolicy.KEEP, periodic)
        refresh(context)
    }

    fun disable(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork("today-widget-periodic")
    }

    fun refresh(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        if (manager.getAppWidgetIds(ComponentName(context, TodayWidgetReceiver::class.java)).isEmpty()) return
        val work = OneTimeWorkRequestBuilder<TodayWidgetWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork("today-widget-refresh", ExistingWorkPolicy.REPLACE, work)
    }

    fun complete(context: Context, household: String, task: String) {
        val work = OneTimeWorkRequestBuilder<TodayWidgetWorker>()
            .setInputData(workDataOf("household" to household, "task" to task)).build()
        WorkManager.getInstance(context).enqueueUniqueWork("today-widget-complete-$task", ExistingWorkPolicy.KEEP, work)
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface TodayWidgetDependencies {
    fun repository(): FamilyRepository
}

class TodayWidgetWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = guard.withLock {
        val ids = GlanceAppWidgetManager(applicationContext).getGlanceIds(TodayWidget::class.java)
        if (ids.isEmpty()) return@withLock Result.success()
        val repository = EntryPointAccessors.fromApplication(applicationContext, TodayWidgetDependencies::class.java).repository()
        val household = inputData.getString("household")
        val task = inputData.getString("task")
        try {
            if (household != null && task != null) {
                try {
                    repository.widgetComplete(household, task)
                } catch (error: HttpException) {
                    if (error.code() !in listOf(401, 403, 404, 409)) throw error
                }
            }
            render(ids, repository.widgetTasks())
            Result.success()
        } catch (_: IOException) {
            render(ids, null)
            if (runAttemptCount < 2) Result.retry() else Result.failure()
        } catch (_: HttpException) {
            render(ids, null)
            Result.failure()
        }
    }

    private suspend fun render(ids: List<GlanceId>, snapshot: WidgetTasks?) {
        val widget = TodayWidget()
        for (id in ids) {
            updateAppWidgetState(applicationContext, id) { prefs ->
                if (snapshot == null) prefs.remove(widgetSnapshot) else prefs[widgetSnapshot] = Json.encodeToString(snapshot)
            }
            widget.update(applicationContext, id)
        }
    }

    companion object {
        private val guard = Mutex()
    }
}
