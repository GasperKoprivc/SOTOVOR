package si.sotovor.app

import java.net.URI

sealed interface NativeLink {
    data class Invite(val code: String) : NativeLink
    data class Target(val household: String, val entry: String?, val shopping: Boolean = false) : NativeLink
}

fun parseNativeLink(raw: String?, inviteHost: String = URI(BuildConfig.PUBLIC_URL).host): NativeLink? {
    val value = raw?.let { runCatching { URI(it) }.getOrNull() } ?: return null
    if (value.scheme == "https" && value.host.equals(inviteHost, ignoreCase = true) && value.rawUserInfo == null) {
        return value.path?.matchEntireInvite()?.let { NativeLink.Invite(it) }
    }
    if (value.scheme != "sotovor" || value.host !in listOf("task", "family", "shopping")) return null
    val query = value.rawQuery.orEmpty().split('&').mapNotNull {
        if ('=' !in it) null else it.substringBefore('=') to it.substringAfter('=')
    }.toMap()
    val idPattern = Regex("[0-9a-f]{24}")
    val household = query["householdId"]?.takeIf(idPattern::matches) ?: return null
    val entry = query["entryId"]?.takeIf(idPattern::matches)
    if (value.host == "task" && entry == null) return null
    return NativeLink.Target(household, entry, value.host == "shopping")
}

private fun String.matchEntireInvite() = Regex("/join/([a-fA-F0-9]{32})").matchEntire(this)?.groupValues?.get(1)?.lowercase()

enum class UpdateLevel { CURRENT, OPTIONAL, REQUIRED }

internal fun upgradeLevel(current: String, minimum: String, latest: String): UpdateLevel {
    fun compare(left: String, right: String): Int {
        val a = left.split('.').mapNotNull(String::toIntOrNull)
        val b = right.split('.').mapNotNull(String::toIntOrNull)
        if (a.size != 3 || b.size != 3) return 0
        return a.indices.firstNotNullOfOrNull { index -> a[index].compareTo(b[index]).takeIf { it != 0 } } ?: 0
    }
    return when {
        compare(current, minimum) < 0 -> UpdateLevel.REQUIRED
        compare(current, latest) < 0 -> UpdateLevel.OPTIONAL
        else -> UpdateLevel.CURRENT
    }
}
