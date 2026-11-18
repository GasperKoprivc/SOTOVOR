package si.sotovor.app

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkloadTest {
    @Test fun rangeChangesCompletedCountsButNotOpenCounts() {
        val workspace = Workspace(
            profile = Profile("Ana", "Test", "test@example.test", ""),
            members = listOf(Member("ana", "Ana")),
            entries = listOf(
                Entry("1", "Open", "task", assigneeId = "ana", createdAt = "2026-11-01T00:00:00Z"),
                Entry(
                    "2",
                    "Done recently",
                    "task",
                    assigneeId = "ana",
                    createdAt = "2026-11-01T00:00:00Z",
                    completedAt = "2026-11-16T00:00:00Z"
                ),
                Entry(
                    "3",
                    "Done earlier",
                    "task",
                    assigneeId = "ana",
                    createdAt = "2026-11-01T00:00:00Z",
                    completedAt = "2026-11-02T00:00:00Z"
                ),
                Entry("4", "Event", "event", assigneeId = "ana", createdAt = "2026-11-01T00:00:00Z")
            )
        )
        val now = Instant.parse("2026-11-17T00:00:00Z")
        assertEquals(listOf(WorkloadRow("Ana", 1, 1)), calculateWorkload(workspace, 7, now))
        assertEquals(listOf(WorkloadRow("Ana", 1, 2)), calculateWorkload(workspace, 30, now))
        assertEquals(listOf(WorkloadRow("Ana", 1, 2)), calculateWorkload(workspace, 0, now))
    }
}
