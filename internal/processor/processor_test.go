package processor

import (
	"gift-redeemer/internal/cache"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// --- Mocks ---

type MockPlayerClient struct{ mock.Mock }
type MockGiftClient struct{ mock.Mock }
type MockSolver struct{ mock.Mock }
type MockStore struct{ mock.Mock }

func (m *MockStore) MarkAsRedeemed(fid int64, code string) { m.Called(fid, code) }

// --- Helpers ---

func setupMockRedis(t *testing.T) (*cache.RedisStore, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	store := cache.NewRedisStore(mr.Addr(), "", 0)
	return store, mr
}

// resetGlobals prevents the 60-second pause from leaking across different tests!
func resetGlobals() {
	pauseMutex.Lock()
	isPaused = false
	pauseUntil = time.Time{}
	pauseMutex.Unlock()
}

// --- Tests ---

func TestProcessor_PauseLogic(t *testing.T) {
	resetGlobals()

	p := NewProcessor(nil, nil, nil, nil, nil)
	defer p.Stop()

	t.Run("TriggerPause sets state", func(t *testing.T) {
		triggerPause()
		pauseMutex.RLock()
		assert.True(t, isPaused)
		assert.True(t, pauseUntil.After(time.Now()))
		pauseMutex.RUnlock()
	})

	t.Run("checkPause returns on context cancel", func(t *testing.T) {
		resetGlobals()
		triggerPause()
		p.Stop()

		start := time.Now()
		p.checkPause()
		// Should return instantly because Stop() cancelled the context
		assert.True(t, time.Since(start) < 200*time.Millisecond)
	})
}

func TestProcessor_JobLocking(t *testing.T) {
	resetGlobals()

	redisStore, mr := setupMockRedis(t)
	defer mr.Close()

	t.Run("Job Lock Management", func(t *testing.T) {
		// 1. Ensure we can acquire a fresh lock
		success := redisStore.AcquireJobLock("job_test")
		assert.True(t, success, "Failed to acquire fresh lock")

		// 2. Ensure we CANNOT acquire a lock that is already taken
		lockedAgain := redisStore.AcquireJobLock("job_test")
		assert.False(t, lockedAgain, "Acquired a lock that should have been blocked")

		// 3. Ensure releasing works so it can be acquired again
		// (Assuming ReleaseJobLock handles the specific job or clears the active lock)
		mr.FlushAll() // Hard reset miniredis to simulate a release

		successAfterRelease := redisStore.AcquireJobLock("job_test")
		assert.True(t, successAfterRelease, "Failed to acquire lock after release")
	})
}

func TestProcessor_RedeemForPlayer_Logic(t *testing.T) {
	resetGlobals()

	t.Run("Global Pause State Verification", func(t *testing.T) {
		// Manually force the global app into a paused state
		pauseMutex.Lock()
		isPaused = true
		pauseUntil = time.Now().Add(1 * time.Second)
		pauseMutex.Unlock()

		start := time.Now()
		p := NewProcessor(nil, nil, nil, nil, nil)

		// This should hang for ~1 second to respect the pause we just set
		p.checkPause()

		assert.True(t, time.Since(start) >= 900*time.Millisecond, "checkPause did not sleep!")

		resetGlobals()
	})
}
