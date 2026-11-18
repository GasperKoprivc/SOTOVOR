package si.sotovor.app

import kotlinx.serialization.Serializable

@Serializable
data class Credentials(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
    val expiresIn: Int,
    val emailVerificationPending: Boolean = false
)
@Serializable data class Login(val email: String, val password: String, val deviceName: String)
@Serializable data class Registration(val firstName: String, val lastName: String, val email: String, val phone: String, val password: String)
@Serializable data class Refresh(val refreshToken: String)
@Serializable class Empty
@Serializable data class Ok(val ok: Boolean)
@Serializable data class NewFamily(val householdName: String, val expectedMembers: Int)
@Serializable data class Invitation(val inviteCode: String)
@Serializable data class HouseId(val householdId: String)
@Serializable data class Profile(val firstName: String, val lastName: String, val email: String, val phone: String, val emailVerificationPending: Boolean = false)
@Serializable data class Space(val id: String, val name: String, val admin: Boolean = false, val inviteCode: String? = null)
@Serializable data class Permissions(val create: Boolean = false, val edit: Boolean = false, val move: Boolean = false, val remove: Boolean = false)
@Serializable data class Member(
    val id: String, val name: String, val inactive: Boolean = false, val admin: Boolean = false,
    val familyRole: String = "other", val availability: String? = null, val unavailableUntil: String? = null,
    val leaveRequested: Boolean = false, val permissions: Permissions? = null
)
@Serializable data class Voice(val mime: String, val data: String? = null)
@Serializable data class Entry(
    val id: String, val title: String, val kind: String, val version: Int = 0,
    val dueOn: String? = null, val category: String = "drugo", val assigneeId: String? = null,
    val completedAt: String? = null, val createdAt: String, val repeatDays: Int = 0, val rotate: Boolean = false,
    val reminderDays: Int = 2, val voice: Voice? = null,
    val allDay: Boolean? = null, val startTime: String? = null, val durationMinutes: Int? = null, val estimatedMinutes: Int? = null, val points: Int? = null
)
@Serializable data class Workspace(
    val profile: Profile, val household: Space? = null, val spaces: List<Space> = emptyList(),
    val memberId: String? = null, val members: List<Member> = emptyList(), val entries: List<Entry> = emptyList(),
    val admin: Boolean = false, val permissions: Permissions = Permissions(), val leaveRequested: Boolean = false
)
@Serializable data class ApiError(val error: ErrorDetail)
@Serializable data class ErrorDetail(val code: String, val message: String)
@Serializable data class Page<T>(val items: List<T> = emptyList(), val nextCursor: String? = null)
@Serializable data class EntryInput(
    val title: String, val kind: String, val category: String = "drugo", val dueOn: String? = null,
    val assigneeId: String? = null, val repeatDays: Int = 0, val rotate: Boolean = false,
    val reminderDays: Int = 2, val version: Int? = null, val voice: Voice? = null,
    val allDay: Boolean? = null, val startTime: String? = null, val durationMinutes: Int? = null, val estimatedMinutes: Int? = null, val points: Int? = null
)
@Serializable data class Version(val version: Int)
@Serializable data class NoticeTarget(val screen: String, val householdId: String, val entryId: String? = null)
@Serializable data class Notice(val id: String, val type: String, val target: NoticeTarget, val createdAt: String, val readAt: String? = null)
@Serializable data class DeviceSession(val id: String, val deviceName: String, val current: Boolean, val lastUsedAt: String)
@Serializable data class DeleteAccount(val password: String, val deleteOwnedFamilies: Boolean)
@Serializable data class PlanningMember(val familyRole: String, val availability: String, val unavailableUntil: String?)
@Serializable data class PlanRequest(val rebalance: Boolean, val signature: String? = null)
@Serializable data class PlanChange(val id: String, val title: String, val assigneeName: String)
@Serializable data class PlanPreview(val changes: List<PlanChange>, val skipped: Int, val until: String, val signature: String)
@Serializable data class PlanResult(val applied: Int, val conflicts: Int)
@Serializable data class NotificationSettings(val assignments: Boolean, val reminders: Boolean, val swaps: Boolean)
@Serializable data class PushDevice(val token: String, val platform: String, val appVersion: String, val locale: String)
@Serializable data class DeviceId(val id: String)
@Serializable data class Versions(val minSupported: String, val latest: String)

data class TaskFilters(val state: String = "all", val search: String = "", val category: String? = null, val assignee: String? = null)
data class EntryEditor(val kind: String, val entry: Entry? = null, val day: String? = null)
