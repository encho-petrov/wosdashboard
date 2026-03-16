package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFortressSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// --- Seed Data ---
	// Alliances
	store.db.Exec("INSERT INTO alliances (id, name) VALUES (100, 'Alliance Alpha'), (200, 'Alliance Beta')")

	// Players
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id) VALUES (1, 'PlayerOne', 100)")
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id) VALUES (2, 'LoneWolf', NULL)")

	// Buildings: 1 Stronghold, 4 Fortresses
	store.db.Exec(`INSERT INTO buildings (id, internal_id, type) VALUES 
        (1, 1, 'Stronghold'),
        (2, 1, 'Fortress'),
        (3, 2, 'Fortress'),
        (4, 3, 'Fortress'),
        (5, 4, 'Fortress')
    `)

	// Rewards
	store.db.Exec("INSERT INTO building_rewards (building_id, week_number, reward_name, reward_icon) VALUES (1, 1, 'Gold Box', 'gold.png')")

	t.Run("Get Basic Fortress Data", func(t *testing.T) {
		// Buildings
		buildings, err := store.GetAllBuildings()
		require.NoError(t, err)
		assert.Len(t, buildings, 5)

		// Rewards
		rewards, err := store.GetWeeklyRewards(1)
		require.NoError(t, err)
		require.Len(t, rewards, 1)
		assert.Equal(t, "Gold Box", rewards[0].Name)

		// Player Alliance ID (Valid)
		allianceID, err := store.GetPlayerAllianceID(1)
		require.NoError(t, err)
		assert.Equal(t, 100, allianceID)

		// Player Alliance ID (Null/Invalid)
		_, err = store.GetPlayerAllianceID(2)
		require.Error(t, err, "Should error because player has no alliance")
	})

	t.Run("SaveSeasonRotation - Business Logic Limits", func(t *testing.T) {
		seasonID := 1

		// 1. Success Case: Valid schedule
		validSchedule := []RotationEntry{
			{SeasonID: seasonID, Week: 1, BuildingID: 1, AllianceID: 100}, // 1 Stronghold (Max 1)
			{SeasonID: seasonID, Week: 1, BuildingID: 2, AllianceID: 100}, // 1 Fortress (Max 1 in Week 1)
		}
		err := store.SaveSeasonRotation(seasonID, validSchedule)
		require.NoError(t, err, "Expected valid schedule to save successfully")

		// Verify it saved
		history, _ := store.GetRotationHistory()
		assert.Contains(t, history, seasonID)

		// 2. Failure Case: Too many Strongholds (Max 1)
		failStronghold := []RotationEntry{
			{SeasonID: seasonID, Week: 1, BuildingID: 1, AllianceID: 100},
			{SeasonID: seasonID, Week: 1, BuildingID: 1, AllianceID: 100},
		}
		err = store.SaveSeasonRotation(seasonID, failStronghold)
		require.ErrorContains(t, err, "Conflict", "Should fail on double stronghold")

		// 3. Failure Case: Too many Fortresses in Week 1 (Max 1)
		failFortressW1 := []RotationEntry{
			{SeasonID: seasonID, Week: 1, BuildingID: 2, AllianceID: 100},
			{SeasonID: seasonID, Week: 1, BuildingID: 3, AllianceID: 100},
		}
		err = store.SaveSeasonRotation(seasonID, failFortressW1)
		require.ErrorContains(t, err, "Max 1", "Week 1 Fortress limit is 1")

		// 4. Failure Case: Too many Fortresses in Week 2 (Max 2)
		failFortressW2 := []RotationEntry{
			{SeasonID: seasonID, Week: 2, BuildingID: 2, AllianceID: 100},
			{SeasonID: seasonID, Week: 2, BuildingID: 3, AllianceID: 100},
			{SeasonID: seasonID, Week: 2, BuildingID: 4, AllianceID: 100},
		}
		err = store.SaveSeasonRotation(seasonID, failFortressW2)
		require.ErrorContains(t, err, "Max 2", "Week 2 Fortress limit is 2")
	})

	t.Run("Rotation Fetchers", func(t *testing.T) {
		seasonID := 2

		// Seed a clean schedule directly
		schedule := []RotationEntry{
			{SeasonID: seasonID, Week: 1, BuildingID: 1, AllianceID: 100}, // Alliance Alpha gets Stronghold
			{SeasonID: seasonID, Week: 1, BuildingID: 2, AllianceID: 200}, // Alliance Beta gets Fortress
		}
		store.SaveSeasonRotation(seasonID, schedule)

		// 1. GetSeasonSchedule
		fullSchedule, err := store.GetSeasonSchedule(seasonID)
		require.NoError(t, err)
		assert.Len(t, fullSchedule, 2)

		// 2. GetRotationForWeek
		week1Rotation, err := store.GetRotationForWeek(seasonID, 1)
		require.NoError(t, err)
		require.Len(t, week1Rotation, 2)
		// Verify JOIN worked
		assert.Equal(t, "Alliance Alpha", week1Rotation[0].AllianceName)

		// 3. GetAllianceRotationForWeek
		allianceRotation, err := store.GetAllianceRotationForWeek(seasonID, 1, 200)
		require.NoError(t, err)
		require.Len(t, allianceRotation, 1)
		assert.Equal(t, "Fortress", allianceRotation[0].BuildingType)
		assert.Equal(t, "Alliance Beta", allianceRotation[0].AllianceName)
	})
}
