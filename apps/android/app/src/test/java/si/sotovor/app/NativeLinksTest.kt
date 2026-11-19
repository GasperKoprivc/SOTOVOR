package si.sotovor.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeLinksTest {
    @Test fun acceptsOnlyTheConfiguredInvitationHostAndValidIds() {
        val code = "0123456789abcdef".repeat(2)
        assertEquals(NativeLink.Invite(code), parseNativeLink("https://family.example/join/$code", "family.example"))
        assertNull(parseNativeLink("https://other.example/join/$code", "family.example"))
        assertNull(parseNativeLink("https://family.example/join/not-a-code", "family.example"))
        val household = "a".repeat(24)
        val entry = "b".repeat(24)
        assertEquals(
            NativeLink.Target(household, entry),
            parseNativeLink("sotovor://task?householdId=$household&entryId=$entry", "family.example")
        )
        assertNull(parseNativeLink("sotovor://task?householdId=$household&entryId=../../other", "family.example"))
    }

    @Test fun comparesUpdateVersionsNumerically() {
        assertEquals(UpdateLevel.REQUIRED, upgradeLevel("0.1.0", "0.2.0", "0.9.0"))
        assertEquals(UpdateLevel.OPTIONAL, upgradeLevel("1.9.5", "1.0.0", "1.10.0"))
        assertEquals(UpdateLevel.CURRENT, upgradeLevel("1.10.0", "1.0.0", "1.10.0"))
    }
}
