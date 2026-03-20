package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAlliancesSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// Seed initial users for foreign key relationships
	store.db.Exec("INSERT INTO users (id, username, alliance_id) VALUES (1, 'Admin', NULL)")
	store.db.Exec("INSERT INTO users (id, username, alliance_id) VALUES (2, 'TargetUser', NULL)")
	store.db.Exec("INSERT INTO users (id, username, alliance_id) VALUES (3, 'R4User', 10)")

	t.Run("Alliance CRUD Operations", func(t *testing.T) {
		// Create
		err := store.CreateAlliance("Test Alliance A", "Fighting")
		require.NoError(t, err)

		// Verify Create
		var count int
		store.db.Get(&count, "SELECT COUNT(*) FROM alliances WHERE name = 'Test Alliance A'")
		assert.Equal(t, 1, count)

		// Get ID of created alliance
		var id int
		store.db.Get(&id, "SELECT id FROM alliances WHERE name = 'Test Alliance A'")

		// Update
		err = store.UpdateAlliance(id, "Updated Alliance", "Farming")
		require.NoError(t, err)

		var updatedType string
		store.db.Get(&updatedType, "SELECT type FROM alliances WHERE id = ?", id)
		assert.Equal(t, "Farming", updatedType)

		// Delete
		err = store.DeleteAlliance(id)
		require.NoError(t, err)

		store.db.Get(&count, "SELECT COUNT(*) FROM alliances WHERE id = ?", id)
		assert.Equal(t, 0, count)
	})

	t.Run("User Alliance Management", func(t *testing.T) {
		// Setup: Create a real alliance
		store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (10, 'Target Alliance', 'Fighting')")
		newAllianceID := 10

		// Test Update
		err := store.UpdateUserAlliance(2, &newAllianceID)
		require.NoError(t, err)

		// Test Get
		allianceID, err := store.GetUserAlliance(2)
		require.NoError(t, err)
		require.NotNil(t, allianceID)
		assert.Equal(t, 10, *allianceID)
	})

	t.Run("Alliance Transfer Lifecycle", func(t *testing.T) {
		// Reset user 2 to have no alliance
		store.db.Exec("UPDATE users SET alliance_id = NULL WHERE id = 2")
		toAlliance := 10

		// 1. Create Transfer Request
		err := store.CreateTransferRequest(2, 3, nil, &toAlliance) // User 3 requests User 2 to join Alliance 10
		require.NoError(t, err)

		// 2. Get Pending Transfers (As Admin: User 1)
		pendingAdmin, err := store.GetPendingTransfers(1, nil)
		require.NoError(t, err)
		require.Len(t, pendingAdmin, 1)
		assert.Equal(t, "TargetUser", pendingAdmin[0].TargetUsername)
		assert.Equal(t, "Pending", pendingAdmin[0].Status)

		transferID := pendingAdmin[0].ID

		// 3. Resolve Transfer (Approve)
		err = store.ResolveTransfer(transferID, "Approved", 1)
		require.NoError(t, err)

		// 4. Verify user was actually moved to the alliance
		currentAlliance, err := store.GetUserAlliance(2)
		require.NoError(t, err)
		require.NotNil(t, currentAlliance)
		assert.Equal(t, 10, *currentAlliance)

		// 5. Verify queue is now empty
		pendingAfter, _ := store.GetPendingTransfers(1, nil)
		assert.Len(t, pendingAfter, 0)
	})

	t.Run("Auto-Approved Transfer Logging", func(t *testing.T) {
		toAlliance := 10
		// Log an auto-approved transfer directly
		err := store.LogAutoApprovedTransfer(2, 3, nil, &toAlliance)
		require.NoError(t, err)

		// Verify it was saved as Approved
		var status string
		err = store.db.Get(&status, "SELECT status FROM alliance_transfers ORDER BY id DESC LIMIT 1")
		require.NoError(t, err)
		assert.Equal(t, "Approved", status)
	})
}
