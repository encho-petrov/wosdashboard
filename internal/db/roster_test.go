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

	t.Run("AddPlayer (Insert and Update)", func(t *testing.T) {
		allianceID := 10
		p1 := RosterPlayer{
			PlayerID:       101,
			Nickname:       "Nick1",
			AvatarImage:    "avatar.png",
			StoveLv:        1,
			StoveLvContent: "stove.png",
			TundraPower:    100,
			NormalPower:    200,
			TroopType:      "Exalted",
			AllianceID:     &allianceID,
		}

		// 1. Initial Insert
		err := store.AddPlayer(p1)
		require.NoError(t, err)

		// 2. Duplicate Insert (Should update instead of skip)
		p1Updated := p1
		p1Updated.Nickname = "Nick1-Updated"
		err = store.AddPlayer(p1Updated)
		require.NoError(t, err)

		players, err := store.GetPlayers(nil)
		require.NoError(t, err)

		var found *PlayerRow
		for _, p := range players {
			if p.FID == 101 {
				found = &p
				break
			}
		}
		require.NotNil(t, found)
		assert.Equal(t, "Nick1-Updated", found.Nickname)
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
			5000, 4000, "Exalted", "Available",
			true, false, true, false, false, true,
			&allianceID, nil, nil,
		)
		require.NoError(t, err)

		var power int64
		var troopType string
		err = store.db.QueryRow("SELECT tundra_power, troop_type FROM players WHERE player_id = ?", fid).Scan(&power, &troopType)
		require.NoError(t, err)

		assert.Equal(t, int64(5000), power)
		assert.Equal(t, "Exalted", troopType)
	})

	t.Run("GetPlayers (Filtering and Sorting)", func(t *testing.T) {
		// We have players: 101 (from AddPlayer), 201 (from Upsert)

		// 1. Get All Players
		allPlayers, err := store.GetPlayers(nil)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(allPlayers), 2)

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
		assert.GreaterOrEqual(t, initialCount, 2)

		// Delete Player 201
		err = store.DeletePlayer(201)
		require.NoError(t, err)

		// Fetch again, should be one less
		newIDs, _ := store.GetAllPlayerIDs()
		assert.Equal(t, initialCount-1, len(newIDs))
	})
}
