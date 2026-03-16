package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlayersSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// --- Seed Ecosystem ---
	// Alliances
	store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (10, 'Main Alliance', 'Home')")
	store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (20, 'War Alliance', 'Fighting')")

	// Teams (Captain is FID 1)
	store.db.Exec("INSERT INTO teams (id, name, captain_fid, alliance_id) VALUES (5, 'Alpha Squad', 1, 10)")

	// Players (Added stove_lv_content to all inserts to prevent NULL scan panics)
	// Player 1: Captain of Alpha Squad
	store.db.Exec(`INSERT INTO players 
        (player_id, nickname, avatar_image, stove_lv, stove_lv_content, normal_power, tundra_power, alliance_id, fighting_alliance_id, team_id, troop_type) 
        VALUES (1, 'CaptainJack', 'jack.png', 30, 'stove30.png', 1000, 2000, 10, 20, 5, 'Infantry')`)

	// Player 2: Teammate in Alpha Squad
	store.db.Exec(`INSERT INTO players 
        (player_id, nickname, avatar_image, stove_lv, stove_lv_content, normal_power, tundra_power, alliance_id, fighting_alliance_id, team_id, troop_type) 
        VALUES (2, 'Sparrow', 'sparrow.png', 28, 'stove28.png', 800, 1500, 10, 20, 5, 'Marksman')`)

	// Player 3: Lone Wolf (No Team, No Alliance)
	store.db.Exec(`INSERT INTO players 
        (player_id, nickname, avatar_image, stove_lv_content, normal_power, tundra_power) 
        VALUES (3, 'LoneWolf', '', '', 500, 500)`)

	t.Run("GetPlayerProfile", func(t *testing.T) {
		// Test 1: Full Profile with Joins (Teammate)
		profile, err := store.GetPlayerProfile(2)
		require.NoError(t, err)
		require.NotNil(t, profile)

		assert.Equal(t, "Sparrow", profile.Nickname)
		assert.Equal(t, 28, profile.StoveLv)
		assert.Equal(t, "Marksman", profile.TroopType)

		// Verify Joins
		require.NotNil(t, profile.AllianceName)
		assert.Equal(t, "Main Alliance", *profile.AllianceName)

		require.NotNil(t, profile.TeamName)
		assert.Equal(t, "Alpha Squad", *profile.TeamName)

		require.NotNil(t, profile.CaptainName)
		assert.Equal(t, "CaptainJack", *profile.CaptainName)

		// Test 2: Lone Wolf (Ensure LEFT JOINs don't break on NULLs)
		loneWolf, err := store.GetPlayerProfile(3)
		require.NoError(t, err)
		assert.Nil(t, loneWolf.AllianceName)
		assert.Nil(t, loneWolf.TeamName)
		assert.Nil(t, loneWolf.CaptainName)
	})

	t.Run("GetPlayerDashboardData", func(t *testing.T) {
		// Test 1: Fetch Dashboard for Captain
		data, err := store.GetPlayerDashboardData(1)
		require.NoError(t, err)
		require.NotNil(t, data)

		// Teammate list should include Player 2, but NOT Player 1 (themselves)
		require.Len(t, data.Teammates, 1)
		assert.Equal(t, 1, len(data.Teammates), "Captain should see 1 teammate")

		// Test 2: Fetch Dashboard for Lone Wolf
		loneData, err := store.GetPlayerDashboardData(3)
		require.NoError(t, err)
		require.NotNil(t, loneData)
		assert.Len(t, loneData.Teammates, 0, "Lone wolf has no team, so teammates should be 0")
	})
}
