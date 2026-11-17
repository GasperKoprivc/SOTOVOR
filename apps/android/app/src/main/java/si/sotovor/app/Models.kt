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
    val reminderDays: Int = 2, val voice: Voice? = null
)
@Serializable data class Workspace(
    val profile: Profile, val household: Space? = null, val spaces: List<Space> = emptyList(),
    val memberId: String? = null, val members: List<Member> = emptyList(), val entries: List<Entry> = emptyList(),
    val admin: Boolean = false, val permissions: Permissions = Permissions()
)
@Serializable data class ApiError(val error: ErrorDetail)
@Serializable data class ErrorDetail(val code: String, val message: String)
