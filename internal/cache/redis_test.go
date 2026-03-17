package cache

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestRedis(t *testing.T) (*RedisStore, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	require.NoError(t, err)

	store := NewRedisStore(mr.Addr(), "", 0)
	return store, mr
}

func TestRedisStore_JobManagement(t *testing.T) {
	store, mr := setupTestRedis(t)
	defer mr.Close()

	t.Run("Acquire and Release Job Lock", func(t *testing.T) {
		// 1. Acquire Lock
		assert.True(t, store.AcquireJobLock("job_123"))

		// 2. Cannot acquire if already locked
		assert.False(t, store.AcquireJobLock("job_999"))

		// 3. Release Lock
		store.ReleaseJobLock()

		// 4. Can acquire again
		assert.True(t, store.AcquireJobLock("job_456"))
	})

	t.Run("Job Progress Tracking", func(t *testing.T) {
		// Ensure it handles missing data gracefully
		assert.Nil(t, store.GetCurrentJobStatus())

		// Set Progress
		store.SetJobProgress("job_123", 50, 100, "RUNNING")

		// Retrieve Progress
		status := store.GetCurrentJobStatus()
		require.NotNil(t, status)
		assert.Equal(t, "job_123", status.JobID)
		assert.Equal(t, 50, status.Processed)
		assert.Equal(t, 100, status.Total)
		assert.Equal(t, "RUNNING", status.Status)
	})
}

func TestRedisStore_RateLimiting(t *testing.T) {
	store, mr := setupTestRedis(t)
	defer mr.Close()

	t.Run("Failed Login Tracking", func(t *testing.T) {
		ip := "192.168.1.1"

		assert.Equal(t, 0, store.GetLoginAttempts(ip))

		store.RecordFailedLogin(ip)
		store.RecordFailedLogin(ip)

		assert.Equal(t, 2, store.GetLoginAttempts(ip))

		store.ClearLoginAttempts(ip)
		assert.Equal(t, 0, store.GetLoginAttempts(ip))
	})

	t.Run("AllowRequest Rate Limiter", func(t *testing.T) {
		key := "rate_limit:test_endpoint"
		ctx := context.Background()

		// Limit to 2 requests
		allowed, err := store.AllowRequest(ctx, key, 2, 1*time.Minute)
		require.NoError(t, err)
		assert.True(t, allowed)

		allowed, _ = store.AllowRequest(ctx, key, 2, 1*time.Minute)
		assert.True(t, allowed)

		// 3rd request should be blocked
		allowed, _ = store.AllowRequest(ctx, key, 2, 1*time.Minute)
		assert.False(t, allowed)

		// Check TTL
		ttl, err := store.GetTimeRemaining(ctx, key)
		require.NoError(t, err)
		assert.Greater(t, ttl, 0)
	})
}

func TestRedisStore_SessionManagement(t *testing.T) {
	store, mr := setupTestRedis(t)
	defer mr.Close()

	t.Run("MFA Sessions", func(t *testing.T) {
		token := "mfa-token-123"
		username := "AdminUser"

		store.SetMfaSession(token, username)
		assert.Equal(t, username, store.GetMfaSession(token))

		store.DeleteMfaSession(token)
		assert.Empty(t, store.GetMfaSession(token))
	})

	t.Run("WebAuthn Sessions", func(t *testing.T) {
		token := "wa-token-123"
		sessionData := &webauthn.SessionData{
			Challenge:        "random-challenge-string",
			UserID:           []byte("user-123"),
			UserVerification: "preferred",
		}

		err := store.SetWebAuthnSession(token, sessionData)
		require.NoError(t, err)

		retrievedData, err := store.GetWebAuthnSession(token)
		require.NoError(t, err)
		require.NotNil(t, retrievedData)
		assert.Equal(t, sessionData.Challenge, retrievedData.Challenge)
		assert.Equal(t, sessionData.UserID, retrievedData.UserID)

		store.DeleteWebAuthnSession(token)
		_, err = store.GetWebAuthnSession(token)
		assert.Error(t, err, "Should error when retrieving deleted session")
	})
}
