package si.sotovor.app

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class MobileAuthenticatorTest {
    @Test fun rotatesBothCredentialsAndRetriesTheOriginalRequest() = exercise(200)

    @Test fun clearsRevokedSessions() = exercise(401)

    @Test fun staleEditIsReportedAsConflictWithoutRetrying() {
        MockWebServer().use { server ->
            server.enqueue(
                MockResponse().setResponseCode(409).setBody("""{"error":{"code":"conflict","message":"Vnos se je spremenil."}}""")
            )
            val body = """{"title":"Task","kind":"task","version":1}"""
            val request = Request.Builder().url(server.url("/api/v1/entries/one/edit"))
                .post(okhttp3.RequestBody.create("application/json".toMediaType(), body)).build()
            OkHttpClient().newCall(request).execute().use { assertEquals(409, it.code) }
            assertEquals(1, server.requestCount)
            assertEquals(body, server.takeRequest().body.readUtf8())
        }
    }

    private fun exercise(refreshStatus: Int) {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401))
            server.enqueue(
                MockResponse().setResponseCode(refreshStatus)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"accessToken":"nextAccess","refreshToken":"nextRefresh","sessionId":"device","expiresIn":60}""")
            )
            if (refreshStatus == 200) server.enqueue(MockResponse().setBody("workspace"))
            val refreshApi = Retrofit.Builder().baseUrl(server.url("/api/v1/"))
                .addConverterFactory(Json.asConverterFactory("application/json".toMediaType()))
                .build().create(SotovorApi::class.java)
            val store = object : CredentialStore {
                var value: Credentials? = Credentials("oldAccess", "oldRefresh", "device", 60)
                override fun current() = value
                override fun replace(expected: Credentials?, value: Credentials?): Boolean {
                    if (this.value != expected) return false
                    this.value = value
                    return true
                }
            }
            val client = OkHttpClient.Builder().authenticator(MobileAuthenticator(store, refreshApi)).build()
            val request = Request.Builder().url(server.url("/api/v1/dashboard")).header("Authorization", "Bearer oldAccess").build()
            client.newCall(request).execute().use { assertEquals(refreshStatus, it.code) }
            assertEquals("Bearer oldAccess", server.takeRequest().getHeader("Authorization"))
            val refresh = server.takeRequest()
            assertEquals("/api/v1/mobile/auth/refresh", refresh.path)
            assertEquals("""{"refreshToken":"oldRefresh"}""", refresh.body.readUtf8())
            if (refreshStatus == 200) {
                assertEquals("Bearer nextAccess", server.takeRequest().getHeader("Authorization"))
                assertEquals("nextRefresh", store.current()?.refreshToken)
            } else {
                assertNull(store.current())
            }
        }
    }
}
