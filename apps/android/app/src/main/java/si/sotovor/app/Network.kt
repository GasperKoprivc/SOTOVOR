package si.sotovor.app

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Named
import javax.inject.Singleton

class MobileAuthenticator(private val store: CredentialStore, private val refreshApi: SotovorApi) : Authenticator {
    @Synchronized
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.priorResponse != null) return null
        val used = response.request.header("Authorization") ?: return null
        val current = store.current() ?: return null
        if (used != "Bearer ${current.accessToken}") return authorized(response.request, current)
        val result = refreshApi.refresh(Refresh(current.refreshToken)).execute()
        val updated = result.body()
        return when {
            result.isSuccessful && updated != null && store.replace(current, updated) -> authorized(response.request, updated)
            result.code() == 401 -> { store.replace(current, null); null }
            else -> null
        }
    }

    private fun authorized(request: Request, credentials: Credentials) =
        request.newBuilder().header("Authorization", "Bearer ${credentials.accessToken}").build()
}

@Module
@InstallIn(SingletonComponent::class)
object Network {
    @Provides @Singleton fun json(): Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Provides @Singleton @Named("public")
    fun publicApi(json: Json): SotovorApi = retrofit(OkHttpClient(), json)

    @Provides @Singleton
    fun api(json: Json, store: SessionStore, @Named("public") publicApi: SotovorApi): SotovorApi =
        retrofit(OkHttpClient.Builder()
            .addInterceptor(Interceptor { chain ->
                val request = chain.request()
                val connection = if (request.url.pathSegments.lastOrNull() == "transcription")
                    chain.withReadTimeout(50, java.util.concurrent.TimeUnit.SECONDS) else chain
                val credentials = store.current()
                connection.proceed(if (credentials == null) request else request.newBuilder()
                    .header("Authorization", "Bearer ${credentials.accessToken}").build())
            })
            .authenticator(MobileAuthenticator(store, publicApi))
            .build(), json)

    private fun retrofit(client: OkHttpClient, json: Json): SotovorApi = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL + "api/v1/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build().create(SotovorApi::class.java)
}
