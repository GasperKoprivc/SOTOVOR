package si.sotovor.app

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class ProScopeTest {
    @Test fun proRequestsUseTheSelectedFamilyRatherThanTheDefaultFamily() = runTest {
        MockWebServer().use { server ->
            val api = Retrofit.Builder().baseUrl(server.url("/api/v1/"))
                .addConverterFactory(Json.asConverterFactory("application/json".toMediaType()))
                .build().create(SotovorApi::class.java)
            val selected = "0123456789abcdef01234567"
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"active":true,"path":"/private.ics"}"""))
            assertEquals(true, api.createCalendarSubscription(selected).active)
            val calendar = server.takeRequest()
            assertEquals("/api/v1/calendar/subscription", calendar.path)
            assertEquals(selected, calendar.getHeader("X-Sotovor-Household"))

            server.enqueue(MockResponse().setBody("""{"range":"all","members":[]}"""))
            api.checkStatistics(selected, "all")
            val statistics = server.takeRequest()
            assertEquals("/api/v1/statistics?range=all", statistics.path)
            assertEquals(selected, statistics.getHeader("X-Sotovor-Household"))
        }
    }
}
