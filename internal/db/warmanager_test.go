package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWarRoomSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	t.Run("Session State Get/Set", func(t *testing.T) {
		initialSession, err := store.GetWarRoomSession()
		require.NoError(t, err)
		assert.Equal(t, "", initialSession)

		err = store.SetWarRoomSession("Tyrant")
		require.NoError(t, err)

		activeSession, err := store.GetWarRoomSession()
		require.NoError(t, err)
		assert.Equal(t, "Tyrant", activeSession)
	})

	t.Run("Attendance Math Logic", func(t *testing.T) {
		insertQuery := `
            INSERT INTO war_room_attendance (fid, event_type, status) VALUES 
            (111, 'SvS', 'Attended'),   -- 1.0
            (111, 'SvS', 'Majority'),   -- 0.75
            (111, 'SvS', 'Minimal'),    -- 0.25
            (111, 'SvS', 'Missed'),     -- 0.0
            (111, 'SvS', 'Exempt')      -- Ignored
        `
		_, err := store.db.Exec(insertQuery)
		require.NoError(t, err)

		stats, err := store.GetWarRoomAttendanceStats("SvS")
		require.NoError(t, err)
		require.Len(t, stats, 1)
		// (1.0 + 0.75 + 0.25 + 0) / 4 = 2.0 / 4 = 50%
		assert.Equal(t, 50, stats[0].Score)
	})

	t.Run("War Stats and Alliances", func(t *testing.T) {
		// Seed an alliance and some players
		store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (10, 'Test Alliance', 'Fighting')")
		store.db.Exec("INSERT INTO players (player_id, nickname, tundra_power, fighting_alliance_id) VALUES (1, 'Player1', 1000, 10), (2, 'Player2', 2000, 10)")

		stats, err := store.GetWarStats()
		require.NoError(t, err)
		require.Len(t, stats, 1)
		assert.Equal(t, "Test Alliance", stats[0].Name)
		assert.Equal(t, 2, stats[0].MemberCount)
		assert.Equal(t, int64(3000), stats[0].TotalPower)
		assert.False(t, stats[0].IsLocked)

		// Test Locking
		err = store.ToggleAllianceLock(10, true)
		require.NoError(t, err)

		statsLocked, _ := store.GetWarStats()
		assert.True(t, statsLocked[0].IsLocked)
	})

	t.Run("Squad Operations", func(t *testing.T) {
		// Promote a captain (Player 1 from the previous test)
		err := store.PromoteCaptain(1, 10)
		require.NoError(t, err)

		// Check if squad was created
		squads, err := store.GetSquads(10)
		require.NoError(t, err)
		require.Len(t, squads, 1)
		assert.Equal(t, "Player1's Squad", squads[0].Name)
		assert.Equal(t, int64(1), squads[0].CaptainFID)

		// Assign a player to it
		err = store.AssignToSquad(2, &squads[0].ID)
		require.NoError(t, err)

		// Demote captain
		err = store.DemoteCaptain(squads[0].ID)
		require.NoError(t, err)

		squadsAfter, _ := store.GetSquads(10)
		assert.Len(t, squadsAfter, 0)
	})

	t.Run("Archive and Reset Event", func(t *testing.T) {
		// Set up pre-archive state
		store.SetWarRoomSession("Tundra")
		// We know Player 1 is deployed from the previous test block
		attendance := []PlayerAttendance{{FID: 1, Attendance: "Attended"}}

		// Run the Archive Transaction
		err := store.ArchiveAndResetEvent("AdminUser", "Test Archive", "Tundra", attendance)
		require.NoError(t, err)

		// 1. Verify Event Snapshot exists
		history, err := store.GetEventHistoryList()
		require.NoError(t, err)
		require.Len(t, history, 1)
		assert.Equal(t, "Test Archive", history[0].Notes)

		eventID := history[0].ID
		_, snapshotPlayers, err := store.GetEventSnapshotDetails(eventID)
		require.NoError(t, err)

		// Player 1 and Player 2 were deployed in the previous test, so both should copy over
		require.Len(t, snapshotPlayers, 2, "Expected deployed players to be copied to history")

		// Find Player 1 and verify the attendance badge was stamped correctly
		var foundPlayer1 *HistoryPlayer
		for i := range snapshotPlayers {
			if snapshotPlayers[i].PlayerID == 1 {
				foundPlayer1 = &snapshotPlayers[i]
				break
			}
		}
		require.NotNil(t, foundPlayer1, "Player 1 should be in the snapshot")
		require.NotNil(t, foundPlayer1.Attendance, "Player 1's attendance pointer should not be nil")
		assert.Equal(t, "Attended", *foundPlayer1.Attendance, "The attendance status should be stamped on the history row")
		// -------------------------------------------------

		// 2. Verify Session was wiped
		session, _ := store.GetWarRoomSession()
		assert.Equal(t, "", session)

		// 3. Verify Live Players were reset
		var count int
		store.db.Get(&count, "SELECT COUNT(*) FROM players WHERE fighting_alliance_id IS NOT NULL")
		assert.Equal(t, 0, count, "Expected all fighting_alliance_ids to be wiped")

		store.db.Get(&count, "SELECT COUNT(*) FROM alliances WHERE is_locked = TRUE")
		assert.Equal(t, 0, count, "Expected all alliances to be unlocked")
	})

	t.Run("Roster Stats Enum Extraction", func(t *testing.T) {
		// This tests the INFORMATION_SCHEMA query
		stats, err := store.GetRosterStats()
		require.NoError(t, err)
		assert.Contains(t, stats.TroopTypes, "Infantry")
		assert.Contains(t, stats.TroopTypes, "None")
		assert.Contains(t, stats.BattleAvailability, "Available")
	})
}
