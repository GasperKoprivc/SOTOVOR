package si.sotovor.app

import app.cash.turbine.test
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceViewModelTest {
    @Test fun restoresWorkspaceAndClearsItAfterRevocation() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = mockk<FamilyRepository>()
            val credentials = MutableStateFlow<Credentials?>(Credentials("a", "b", "session", 10))
            val workspace = Workspace(Profile("Ana", "Test", "a@example.test", ""))
            every { repository.sessions } returns credentials
            coEvery { repository.workspace() } returns workspace
            val model = WorkspaceViewModel(repository, Json)
            advanceUntilIdle()
            model.state.test {
                assertEquals(workspace, awaitItem().workspace)
                credentials.value = null
                assertEquals(null, awaitItem().workspace)
                assertFalse(model.state.value.busy)
            }
        } finally {
            Dispatchers.resetMain()
        }
    }
}
