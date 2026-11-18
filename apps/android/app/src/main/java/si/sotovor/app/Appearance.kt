package si.sotovor.app

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import kotlinx.serialization.Serializable
import java.util.Locale

@Serializable
data class Appearance(val language: String = "sl", val theme: String = "dark")

internal fun readAppearance(context: Context): Appearance {
    val prefs = context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
    return Appearance(prefs.getString("language", null) ?: "sl", prefs.getString("theme", null) ?: "dark")
}

internal fun writeAppearance(context: Context, value: Appearance) {
    context.getSharedPreferences("appearance", Context.MODE_PRIVATE).edit()
        .putString("language", value.language).putString("theme", value.theme).apply()
}

internal fun androidLocale(language: String): Locale = Locale.forLanguageTag(if (language == "sl") "sl" else "en")

internal fun appearanceContext(context: Context, language: String): Context {
    val configuration = Configuration(context.resources.configuration)
    configuration.setLocales(LocaleList(androidLocale(language)))
    return context.createConfigurationContext(configuration)
}

@Composable
fun AppearanceControls(value: Appearance, enabled: Boolean = true, change: (Appearance) -> Unit) {
    SelectField(stringResource(R.string.appearance_language), if (value.language == "sl") "sl" else "en",
        listOf("sl" to "Slovenščina", "en" to "English"), enabled) { change(value.copy(language = it)) }
    SelectField(stringResource(R.string.appearance_theme), value.theme, listOf(
        "dark" to stringResource(R.string.appearance_dark), "light" to stringResource(R.string.appearance_light),
        "system" to stringResource(R.string.appearance_system)
    ), enabled) { change(value.copy(theme = it)) }
}
