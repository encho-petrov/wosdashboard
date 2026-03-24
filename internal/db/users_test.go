package db

import (
	"encoding/base64"
	"testing"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUsersSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// Seed an Alliance for testing role assignments
	store.db.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Admin Alliance')")

	t.Run("User CRUD & Access", func(t *testing.T) {
		// 1. Create User (0 alliance ID should map to NULL)
		err := store.CreateUser("Admin", "hash123", "SuperAdmin", 0)
		require.NoError(t, err)

		// 2. Create User with Alliance
		err = store.CreateUser("R4Leader", "hash456", "R4", 10)
		require.NoError(t, err)

		// 3. Get User By Username
		adminUser, err := store.GetUserByUsername("Admin")
		require.NoError(t, err)
		assert.Equal(t, "SuperAdmin", adminUser.Role)
		assert.Nil(t, adminUser.AllianceID)

		// 4. Update Password
		err = store.UpdatePassword("Admin", "newHash789")
		require.NoError(t, err)

		updatedAdmin, _ := store.GetUserByUsername("Admin")
		assert.Equal(t, "newHash789", updatedAdmin.PasswordHash)

		// 5. Update Access
		newAlliance := 10
		err = store.UpdateUserAccess(adminUser.ID, "R5", &newAlliance)
		require.NoError(t, err)

		// 6. Get All Users (Safe fetcher)
		users, err := store.GetAllUsers()
		require.NoError(t, err)
		require.Len(t, users, 2)
		assert.False(t, users[0].HasWebAuthn) // Sub-query test

		// 7. Delete User
		err = store.DeleteUser(adminUser.ID)
		require.NoError(t, err)

		usersAfterDelete, _ := store.GetAllUsers()
		assert.Len(t, usersAfterDelete, 1)
	})

	t.Run("MFA & Security Resets", func(t *testing.T) {
		// Seed a fresh user
		store.CreateUser("TargetUser", "hash", "User", 0)
		user, _ := store.GetUserByUsername("TargetUser")

		// 1. Enable MFA
		err := store.EnableUserMFA(int64(user.ID), "SECRET_KEY")
		require.NoError(t, err)

		mfaUser, _ := store.GetUserByUsername("TargetUser")
		assert.True(t, mfaUser.MFAEnabled)
		assert.Equal(t, "SECRET_KEY", mfaUser.MFASecret)

		// 2. Reset MFA only
		err = store.ResetUserMFA(user.ID)
		require.NoError(t, err)

		resetUser, _ := store.GetUserByUsername("TargetUser")
		assert.False(t, resetUser.MFAEnabled)
		assert.Equal(t, "", resetUser.MFASecret)

		// 3. Hard Security Reset (Password + MFA)
		store.EnableUserMFA(int64(user.ID), "SECRET_2")
		err = store.ResetUserSecurity(user.ID, "emergencyHash")
		require.NoError(t, err)

		hardResetUser, _ := store.GetUserByUsername("TargetUser")
		assert.False(t, hardResetUser.MFAEnabled)
		assert.Equal(t, "emergencyHash", hardResetUser.PasswordHash)
	})

	t.Run("WebAuthn Lifecycle", func(t *testing.T) {
		store.CreateUser("WebAuthnUser", "hash", "User", 0)
		user, _ := store.GetUserByUsername("WebAuthnUser")

		// Mock a WebAuthn Credential
		credID := []byte("test-credential-id-bytes")
		cred := &webauthn.Credential{
			ID: credID,
		}

		// 1. Save Credential
		err := store.SaveWebAuthnCredential(user.ID, cred)
		require.NoError(t, err)

		// 2. Verify HasWebAuthn
		has := store.HasWebAuthn(user.ID)
		assert.True(t, has)

		// 3. Load Credentials
		err = store.LoadWebAuthnCredentials(user)
		require.NoError(t, err)
		require.Len(t, user.WebAuthnCreds, 1)
		assert.Equal(t, credID, user.WebAuthnCreds[0].ID)

		// 4. Get Devices (Base64 Encoded)
		devices, err := store.GetUserWebAuthnDevices(user.ID)
		require.NoError(t, err)
		require.Len(t, devices, 1)
		expectedBase64 := base64.StdEncoding.EncodeToString(credID)
		assert.Equal(t, expectedBase64, devices[0])

		// 5. Delete Credential
		err = store.DeleteWebAuthnCredential(user.ID, expectedBase64)
		require.NoError(t, err)

		hasAfterDelete := store.HasWebAuthn(user.ID)
		assert.False(t, hasAfterDelete)
	})

	t.Run("Audit Logs", func(t *testing.T) {
		// --- 1. Normal Log Setup ---
		store.CreateUser("AuditedUser", "hash", "User", 0)
		user, _ := store.GetUserByUsername("AuditedUser")

		normalLog := AuditLog{
			UserID:    int64(user.ID),
			Action:    "LOGIN_SUCCESS",
			Details:   "User logged in",
			IPAddress: "192.168.1.1",
		}
		err := store.CreateAuditLog(normalLog)
		require.NoError(t, err)

		// --- 2. Orphaned Log Setup  ---
		store.CreateUser("DoomedUser", "hash", "User", 0)
		doomedUser, _ := store.GetUserByUsername("DoomedUser")

		orphanedLog := AuditLog{
			UserID:    int64(doomedUser.ID),
			Action:    "TEST_NULL_JOIN",
			Details:   "Testing fallback for deleted users",
			IPAddress: "127.0.0.1",
		}
		err = store.CreateAuditLog(orphanedLog)
		require.NoError(t, err)

		err = store.DeleteUser(doomedUser.ID)
		require.NoError(t, err)

		// --- 3. Execution & Assertions ---
		logs, err := store.GetAuditLogs()

		require.NoError(t, err, "GetAuditLogs should survive a NULL join")
		require.True(t, len(logs) >= 2, "Should fetch at least our two test logs")

		// Safely iterate through the logs to verify both scenarios
		var foundNormal, foundOrphaned bool
		for i := range logs {
			if logs[i].Action == "LOGIN_SUCCESS" {
				assert.Equal(t, "AuditedUser", logs[i].UserName, "Standard JOIN should resolve the username")
				foundNormal = true
			}
			if logs[i].Action == "TEST_NULL_JOIN" {
				assert.Equal(t, "Deleted User", logs[i].UserName, "COALESCE should provide the fallback string")
				foundOrphaned = true
			}
		}

		assert.True(t, foundNormal, "Normal log was missing from results")
		assert.True(t, foundOrphaned, "Orphaned log was missing from results")
	})
}
