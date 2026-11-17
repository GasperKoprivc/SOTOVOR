package si.sotovor.app

import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

interface SotovorApi {
    @POST("mobile/auth/login") suspend fun login(@Body login: Login): Credentials
    @POST("mobile/auth/refresh") fun refresh(@Body refresh: Refresh): Call<Credentials>
    @POST("auth/register") suspend fun register(@Body registration: Registration): Ok
    @POST("auth/email/resend") suspend fun resend(@Body body: Empty = Empty()): Ok
    @POST("mobile/auth/logout") suspend fun logout(@Body body: Empty = Empty()): Ok
    @GET("dashboard") suspend fun dashboard(
        @Header("X-Sotovor-Household") household: String?,
        @Query("includeEntries") includeEntries: Boolean = false
    ): Workspace?
    @POST("households") suspend fun createFamily(@Body input: NewFamily): HouseId
    @POST("households/join") suspend fun joinFamily(@Body input: Invitation): HouseId
}
