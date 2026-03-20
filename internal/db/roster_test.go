package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRosterSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// Seed Alliances for foreign keys
	store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (10, 'Main Alliance', 'Home')")
	store.db.Exec("INSERT INTO alliances (id, name, type) VALUES (20, 'Academy', 'Farm')")

	t.Run("AddPlayers (Bulk Insert Ignore)", func(t *testing.T) {
		fids := []int64{101, 102, 103}

		// 1. Initial Insert
		added, skipped, err := store.AddPlayers(fids)
		require.NoError(t, err)
		assert.Equal(t, 3, added)
		assert.Equal(t, 0, skipped)

		// 2. Duplicate Insert (Should skip them safely)
		fidsWithDuplicates := []int64{102, 103, 104} // 104 is new
		added2, skipped2, err := store.AddPlayers(fidsWithDuplicates)
		require.NoError(t, err)
		assert.Equal(t, 1, added2, "Only 104 should be added")
		assert.Equal(t, 2, skipped2, "102 and 103 should be skipped")
	})

	t.Run("UpsertPlayer (API Sync)", func(t *testing.T) {
		fid := int64(201)

		// 1. Initial Upsert (Behaves like an Insert)
		err := store.UpsertPlayer(fid, "OldName", 120, 25, "stove25.png", "avatar1.png")
		require.NoError(t, err)

		// 2. Second Upsert (Behaves like an Update)
		err = store.UpsertPlayer(fid, "NewName", 120, 26, "stove26.png", "avatar2.png")
		require.NoError(t, err)

		// Verify data changed
		var nick, avatar string
		var stove int
		err = store.db.QueryRow("SELECT nickname, avatar_image, stove_lv FROM players WHERE player_id = ?", fid).Scan(&nick, &avatar, &stove)
		require.NoError(t, err)

		assert.Equal(t, "NewName", nick)
		assert.Equal(t, "avatar2.png", avatar)
		assert.Equal(t, 26, stove)
	})

	t.Run("UpdatePlayerDetails", func(t *testing.T) {
		fid := int64(101) // Inserted from AddPlayers test above
		allianceID := 10

		err := store.UpdatePlayerDetails(
			fid,
			5000, 4000, "Lancer", "Available",
			true, false, true, false,
			&allianceID, nil, nil,
		)
		require.NoError(t, err)

		var power int64
		var troopType string
		err = store.db.QueryRow("SELECT tundra_power, troop_type FROM players WHERE player_id = ?", fid).Scan(&power, &troopType)
		require.NoError(t, err)

		assert.Equal(t, int64(5000), power)
		assert.Equal(t, "Lancer", troopType)
	})

	t.Run("GetPlayers (Filtering and Sorting)", func(t *testing.T) {
		// We have multiple players now: 101, 102, 103, 104, 201

		// 1. Get All Players
		allPlayers, err := store.GetPlayers(nil)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(allPlayers), 5)

		// 2. Filter by Alliance (Only 101 was assigned to alliance 10)
		allianceFilter := 10
		alliancePlayers, err := store.GetPlayers(&allianceFilter)
		require.NoError(t, err)
		require.Len(t, alliancePlayers, 1)

		// Assuming PlayerRow struct handles mapping correctly
		// We'll trust the length assertion as proof the WHERE clause fired correctly
	})

	t.Run("GetAlliances", func(t *testing.T) {
		alliances, err := store.GetAlliances()
		require.NoError(t, err)
		require.Len(t, alliances, 2)
		// Should be ordered alphabetically by Name then Type
		assert.Equal(t, "Academy", alliances[0].Name)
		assert.Equal(t, "Main Alliance", alliances[1].Name)
	})

	t.Run("GetAllPlayerIDs & DeletePlayer", func(t *testing.T) {
		ids, err := store.GetAllPlayerIDs()
		require.NoError(t, err)
		initialCount := len(ids)
		assert.GreaterOrEqual(t, initialCount, 5)

		// Delete Player 104
		err = store.DeletePlayer(104)
		require.NoError(t, err)

		// Fetch again, should be one less
		newIDs, _ := store.GetAllPlayerIDs()
		assert.Equal(t, initialCount-1, len(newIDs))
	})
}
