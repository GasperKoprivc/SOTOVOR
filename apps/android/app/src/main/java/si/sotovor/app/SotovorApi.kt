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
import retrofit2.http.Streaming

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
    @GET("mobile/min-version") suspend fun versions(): Versions
    @GET("entries/{id}") suspend fun entry(@Header("X-Sotovor-Household") household: String, @Path("id") id: String): Entry
    @POST("entries/{id}/transcription") suspend fun transcribe(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body input: Empty = Empty()): VoiceTranscript
    @Streaming @GET("entries/{id}/voice") suspend fun voice(@Header("X-Sotovor-Household") household: String, @Path("id") id: String): ResponseBody
    @POST("households/invite/rotate") suspend fun rotateInvite(@Header("X-Sotovor-Household") household: String, @Body body: Empty = Empty()): Ok
    @POST("households/leave") suspend fun leave(@Header("X-Sotovor-Household") household: String, @Body body: Empty = Empty()): Ok
    @POST("households/members/{id}/planning") suspend fun member(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body body: PlanningMember): Ok
    @POST("households/members/{id}/permissions") suspend fun permissions(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body body: Permissions): Ok
    @POST("households/members/{id}/{action}") suspend fun memberAction(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Path("action") action: String, @Body body: Empty = Empty()): Ok
    @GET("tasks/{id}/details") suspend fun taskDetails(@Header("X-Sotovor-Household") household: String, @Path("id") id: String): TaskDetails
    @POST("tasks/{id}/checklist") suspend fun addCheck(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body input: ChecklistInput): TaskDetails
    @PUT("tasks/{id}/checklist/{item}") suspend fun checkItem(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Path("item") item: String, @Body input: ChecklistCheck): TaskDetails
    @POST("tasks/{id}/comments") suspend fun addComment(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body input: CommentInput): TaskDetails
    @PUT("me/appearance") suspend fun saveAppearance(@Body appearance: Appearance): Appearance
    @GET("widget/today") suspend fun widgetTasks(@Header("X-Sotovor-Household") household: String?): WidgetTasks
    @GET("rewards") suspend fun rewards(@Header("X-Sotovor-Household") household: String): Rewards
    @PUT("rewards") suspend fun saveRewards(@Header("X-Sotovor-Household") household: String, @Body input: RewardSettings): Ok
    @GET("calendar/subscription") suspend fun calendarSubscription(): CalendarSubscription
    @POST("calendar/subscription") suspend fun createCalendarSubscription(@Body input: Empty = Empty()): CalendarSubscription
    @DELETE("calendar/subscription") suspend fun revokeCalendarSubscription(): CalendarSubscription
    @GET("shopping") suspend fun shopping(@Header("X-Sotovor-Household") household: String): List<ShoppingItem>
    @POST("shopping") suspend fun addShopping(@Header("X-Sotovor-Household") household: String, @Body input: ShoppingInput): ShoppingItem
    @PUT("shopping/{id}") suspend fun checkShopping(@Header("X-Sotovor-Household") household: String, @Path("id") id: String, @Body input: ShoppingCheck): ShoppingItem
    @DELETE("shopping/{id}") suspend fun removeShopping(@Header("X-Sotovor-Household") household: String, @Path("id") id: String): Ok
    @GET("shopping/push") suspend fun shoppingPush(@Header("X-Sotovor-Household") household: String): ShoppingPush
    @PUT("shopping/push") suspend fun saveShoppingPush(@Header("X-Sotovor-Household") household: String, @Body input: ShoppingPush): ShoppingPush
    @POST("planning/preview") suspend fun preview(@Header("X-Sotovor-Household") household: String, @Body body: PlanRequest): PlanPreview
    @POST("planning/apply") suspend fun apply(@Header("X-Sotovor-Household") household: String, @Body body: PlanRequest): PlanResult
    @GET("me/notification-settings") suspend fun settings(): NotificationSettings
    @PUT("me/notification-settings") suspend fun saveSettings(@Body settings: NotificationSettings): NotificationSettings
    @POST("devices") suspend fun pushDevice(@Body body: PushDevice): DeviceId
}
