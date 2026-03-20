package auth

import (
	"gift-redeemer/internal/config"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuth_Passwords(t *testing.T) {
	password := "super-secret-123"

	t.Run("Hash and Check Success", func(t *testing.T) {
		hash, err := HashPassword(password)
		require.NoError(t, err)
		assert.NotEqual(t, password, hash)

		// Verification
		assert.True(t, CheckPassword(password, hash))
	})

	t.Run("Check Failure", func(t *testing.T) {
		hash, _ := HashPassword(password)
		assert.False(t, CheckPassword("wrong-password", hash))
	})
}

func TestAuth_JWT(t *testing.T) {
	// Initialize with a mock config
	cfg := &config.Config{}
	cfg.ApiSecrets.JwtSecret = "test-secret-key-123"
	cfg.Auth.AccessTokenDuration = 1
	cfg.Auth.RefreshTokenDuration = 5
	Init(cfg)

	t.Run("Generate and Validate Token", func(t *testing.T) {
		username := "CommanderWick"
		role := "admin"

		token, err := GenerateToken(username, role)
		require.NoError(t, err)
		assert.NotEmpty(t, token)

		claims, err := ValidateToken(token)
		require.NoError(t, err)
		assert.Equal(t, username, claims.Username)
		assert.Equal(t, role, claims.Role)
	})

	t.Run("Reject Tampered Token", func(t *testing.T) {
		token, _ := GenerateToken("user", "role")
		tamperedToken := token + "malicious-suffix"

		claims, err := ValidateToken(tamperedToken)
		assert.Error(t, err)
		assert.Nil(t, claims)
	})

	t.Run("Refresh Token Generation", func(t *testing.T) {
		token, err := GenerateRefreshToken("user", "role")
		require.NoError(t, err)

		claims, err := ValidateToken(token)
		require.NoError(t, err)
		assert.Equal(t, "user", claims.Username)
	})
}

func TestAuth_DiscordState(t *testing.T) {
	secret := "discord-test-secret"

	t.Run("Preserve AllianceID Pointer", func(t *testing.T) {
		aid := 101
		token, err := GenerateDiscordState(&aid, secret)
		require.NoError(t, err)

		claims, err := ValidateDiscordState(token, secret)
		require.NoError(t, err)
		require.NotNil(t, claims.AllianceID)
		assert.Equal(t, aid, *claims.AllianceID)
	})

	t.Run("Handle Null AllianceID", func(t *testing.T) {
		token, err := GenerateDiscordState(nil, secret)
		require.NoError(t, err)

		claims, err := ValidateDiscordState(token, secret)
		require.NoError(t, err)
		assert.Nil(t, claims.AllianceID)
	})

	t.Run("Reject Wrong Secret", func(t *testing.T) {
		token, _ := GenerateDiscordState(nil, secret)
		_, err := ValidateDiscordState(token, "wrong-secret")
		assert.Error(t, err)
	})
}
