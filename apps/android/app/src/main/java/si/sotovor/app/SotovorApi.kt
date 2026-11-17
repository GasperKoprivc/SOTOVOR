package si.sotovor.app

import retrofit2.Call
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
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
    @GET("tasks") suspend fun tasks(
        @Header("X-Sotovor-Household") household: String, @Query("state") state: String,
        @Query("search") search: String?, @Query("category") category: String?,
        @Query("assignee") assignee: String?, @Query("cursor") cursor: String?
    ): Page<Entry>
    @POST("entries?includeEntries=false") suspend fun createEntry(@Header("X-Sotovor-Household") household: String, @Body body: EntryInput): Workspace
    @POST("entries/{id}/edit?includeEntries=false") suspend fun editEntry(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body body: EntryInput): Workspace
    @POST("entries/{id}/remove?includeEntries=false") suspend fun removeEntry(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body body: Version): Workspace
    @POST("tasks/{id}/{action}?includeEntries=false") suspend fun taskAction(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Path("action") action: String, @Body body: Empty = Empty()): Workspace
    @GET("notifications") suspend fun notices(@Header("X-Sotovor-Household") household: String, @Query("cursor") cursor: String? = null): Page<Notice>
    @PUT("notifications/{id}/read") suspend fun readNotice(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body body: Empty = Empty()): Ok
    @GET("mobile/auth/sessions") suspend fun sessions(): List<DeviceSession>
    @DELETE("mobile/auth/sessions/{id}") suspend fun revoke(@Path("id") id: String): Ok
    @GET("me/export") suspend fun export(): ResponseBody
    @HTTP(method = "DELETE", path = "me", hasBody = true) suspend fun deleteAccount(@Body body: DeleteAccount): Ok
}
