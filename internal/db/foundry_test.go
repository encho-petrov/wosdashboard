package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFoundrySuite(t *testing.T) {
	resetDB(t)
	store := testStore

	allianceID := 100
	eventType := "Foundry"

	// Seed the Players table (Crucial because Archive uses a JOIN on players)
	store.db.Exec("INSERT INTO players (player_id, nickname, tundra_power) VALUES (1, 'Striker', 5000)")
	store.db.Exec("INSERT INTO players (player_id, nickname, tundra_power) VALUES (2, 'Defender', 4000)")
	store.db.Exec("INSERT INTO players (player_id, nickname, tundra_power) VALUES (3, 'BenchWarmer', 1000)")

	t.Run("Deploy & Lock Legions", func(t *testing.T) {
		legion1 := 1

		// 1. Deploy Player 1 as Main
		err := store.DeployAllianceEventPlayer(allianceID, eventType, 1, &legion1, false)
		require.NoError(t, err)

		// 2. Deploy Player 2 as Sub
		err = store.DeployAllianceEventPlayer(allianceID, eventType, 2, &legion1, true)
		require.NoError(t, err)

		// 3. Re-Deploy Player 2 to update their status (testing ON DUPLICATE KEY)
		err = store.DeployAllianceEventPlayer(allianceID, eventType, 2, &legion1, false) // Make them a main
		require.NoError(t, err)

		// 4. Remove a player (targetLegion == nil)
		err = store.DeployAllianceEventPlayer(allianceID, eventType, 3, &legion1, false) // Deploy
		err = store.DeployAllianceEventPlayer(allianceID, eventType, 3, nil, false)      // Remove
		require.NoError(t, err)

		// 5. Lock the legion
		err = store.ToggleAllianceEventLock(allianceID, eventType, legion1, true)
		require.NoError(t, err)
	})

	t.Run("Mark Attendance & Fetch State", func(t *testing.T) {
		// Mark attendance
		err := store.UpdateAllianceEventAttendance(allianceID, eventType, 1, "Attended")
		require.NoError(t, err)
		err = store.UpdateAllianceEventAttendance(allianceID, eventType, 2, "Missed")
		require.NoError(t, err)

		// Fetch State
		legions, roster, stats, err := store.GetAllianceEventState(allianceID, eventType)
		require.NoError(t, err)

		// Verify Legions
		require.Len(t, legions, 1)
		assert.True(t, legions[0].IsLocked)

		// Verify Roster
		require.Len(t, roster, 2)
		// Player 1 should be first because of 'ORDER BY p.tundra_power DESC' (5000 > 4000)
		assert.Equal(t, int64(1), roster[0].PlayerID)
		assert.Equal(t, "Attended", roster[0].Attendance)
		assert.Equal(t, int64(2), roster[1].PlayerID)
		assert.False(t, roster[1].IsSub, "Player 2 should be a main from the ON DUPLICATE update")

		// Stats should be empty because we haven't archived anything into history yet
		assert.Len(t, stats, 0)
	})

	t.Run("Archive Event & Verify History", func(t *testing.T) {
		// Archive the board
		err := store.ArchiveAllianceEvent(allianceID, eventType, "AdminUser", "Vs Alliance X")
		require.NoError(t, err)

		// 1. Verify board is wiped and unlocked
		legions, roster, _, _ := store.GetAllianceEventState(allianceID, eventType)
		assert.Len(t, roster, 0, "Roster should be empty after archive")
		if len(legions) > 0 {
			assert.False(t, legions[0].IsLocked, "Legions should be unlocked after archive")
		}

		// 2. Fetch History List
		historyList, err := store.GetAllianceHistoryList(allianceID, eventType)
		require.NoError(t, err)
		require.Len(t, historyList, 1)
		assert.Equal(t, "Vs Alliance X", historyList[0].Notes)

		historyID := historyList[0].ID

		// 3. Fetch History Snapshot
		snapshot, err := store.GetAllianceHistorySnapshot(historyID, allianceID)
		require.NoError(t, err)
		require.Len(t, snapshot, 2)

		// 4. Verify Nickname JOIN worked during archive
		assert.NotEmpty(t, snapshot[0].Nickname, "Nickname should have been pulled from players table")
	})

	t.Run("Historical Attendance Math", func(t *testing.T) {
		// Since we archived an event where P1 = Attended, P2 = Missed, let's fetch the state again to see the stats
		_, _, stats, err := store.GetAllianceEventState(allianceID, eventType)
		require.NoError(t, err)
		require.Len(t, stats, 2)

		// Map stats by playerID for easy checking
		statMap := make(map[int64]int)
		for _, s := range stats {
			statMap[s.PlayerID] = s.Score
		}

		// P1 had 1 Attended = 100%
		assert.Equal(t, 100, statMap[1])
		// P2 had 1 Missed = 0%
		assert.Equal(t, 0, statMap[2])
	})
}
