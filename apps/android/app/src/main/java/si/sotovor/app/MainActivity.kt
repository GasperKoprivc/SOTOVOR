package si.sotovor.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalResources
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: WorkspaceViewModel by viewModels()

    @Inject lateinit var nativePush: NativePush

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        viewModel.receiveLink(intent.dataString ?: intent.getStringExtra("deepLink"))
        viewModel.checkVersion()
        splash.setKeepOnScreenCondition { viewModel.state.value.busy && viewModel.state.value.workspace == null && !rendered }
        enableEdgeToEdge()
        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            var local by remember { mutableStateOf(readAppearance(this)) }
            val appearance = state.workspace?.profile?.appearance ?: local
            LaunchedEffect(appearance) {
                writeAppearance(this@MainActivity, appearance)
                local = appearance
                nativePush.requestToken()
                TodayWidgetWork.refresh(this@MainActivity)
            }
            val configuration = LocalConfiguration.current
            val localized = remember(appearance.language, configuration) {
                appearanceContext(this, appearance.language).resources
            }
            val dark = when (appearance.theme) {
                "light" -> false
                "system" -> isSystemInDarkTheme()
                else -> true
            }
            val colors = when {
                Build.VERSION.SDK_INT >= 31 && dark -> dynamicDarkColorScheme(this)
                Build.VERSION.SDK_INT >= 31 -> dynamicLightColorScheme(this)
                dark -> darkColorScheme(primary = Color(0xFFA5D0C0), secondary = Color(0xFFF1B287), background = Color(0xFF101D20))
                else -> lightColorScheme(primary = Color(0xFF28584A), secondary = Color(0xFF8F492B), background = Color(0xFFFFF8F0))
            }
            CompositionLocalProvider(LocalConfiguration provides localized.configuration, LocalResources provides localized) {
                MaterialTheme(colorScheme = colors) {
                    Surface(Modifier.fillMaxSize()) {
                        SotovorNav(viewModel, nativePush, appearance) {
                            if (state.workspace == null) local = it else viewModel.appearance(it)
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.receiveLink(intent.dataString ?: intent.getStringExtra("deepLink"))
    }

    private var rendered = false
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        rendered = rendered || hasFocus
    }
}
