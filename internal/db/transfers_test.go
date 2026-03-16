package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTransfersSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// Seed Alliances
	store.db.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Target Alliance')")

	// Seed an existing player for the Outbound test
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id, status) VALUES (999, 'Traitor', 10, 'Active')")

	t.Run("Season Lifecycle", func(t *testing.T) {
		// 1. Create Season
		err := store.CreateTransferSeason("Season 5", 500000000, true, 3, 15)
		require.NoError(t, err)

		// 2. Fetch Active Season
		activeSeason, err := store.GetActiveTransferSeason()
		require.NoError(t, err)
		require.NotNil(t, activeSeason)
		assert.Equal(t, "Season 5", activeSeason.Name)
		assert.Equal(t, int64(500000000), activeSeason.PowerCap)
		assert.Equal(t, 3, activeSeason.SpecialInvitesAvailable)

		seasonID := activeSeason.ID

		// 3. Update Params
		err = store.UpdateTransferSeasonParams(seasonID, 600000000, 5, 20)
		require.NoError(t, err)

		updatedSeason, _ := store.GetActiveTransferSeason()
		assert.Equal(t, int64(600000000), updatedSeason.PowerCap)
		assert.Equal(t, 5, updatedSeason.SpecialInvitesAvailable)

		// 4. Close Season
		err = store.UpdateSeasonStatus(seasonID, "Closed")
		require.NoError(t, err)

		// Verify Active is now nil
		nilSeason, _ := store.GetActiveTransferSeason()
		assert.Nil(t, nilSeason)

		// Verify it appears in Closed
		closedSeasons, err := store.GetClosedTransferSeasons()
		require.NoError(t, err)
		require.Len(t, closedSeasons, 1)
		assert.Equal(t, "Season 5", closedSeasons[0].Name)
	})

	t.Run("Transfer Records & Transactions", func(t *testing.T) {
		// Re-open a season for record testing
		store.CreateTransferSeason("Season 6", 500000000, false, 0, 10)
		season, _ := store.GetActiveTransferSeason()
		seasonID := season.ID

		// 1. Add Inbound Record
		record := TransferRecord{
			SeasonID:     seasonID,
			FID:          12345,
			Nickname:     "NewGuy",
			FurnaceLevel: 30,
			SourceState:  "State 100",
			Avatar:       "avatar.png",
			FurnaceImage: "furnace.png",
		}
		err := store.AddTransferRecord(record)
		require.NoError(t, err)

		// 2. Fetch Records
		records, err := store.GetTransferRecords(seasonID)
		require.NoError(t, err)
		require.Len(t, records, 1)

		recordID := records[0].ID

		// 3. Update Record
		targetAlliance := 10
		err = store.UpdateTransferRecord(recordID, 1000000, &targetAlliance, "Normal", "Pending")
		require.NoError(t, err)

		// 4. Confirm Inbound Transfer (Tests the UPSERT into players table)
		err = store.ConfirmInboundTransfer(recordID, 12345, "NewGuy", 10)
		require.NoError(t, err)

		// Verify Player was created
		var pStatus string
		err = store.db.Get(&pStatus, "SELECT status FROM players WHERE player_id = 12345")
		require.NoError(t, err)
		assert.Equal(t, "Active", pStatus)

		// 5. Confirm Outbound Transfer (Tests moving a player to Archived)
		err = store.ConfirmOutboundTransfer(999, seasonID, "Traitor", "State 200")
		require.NoError(t, err)

		// Verify Player was archived and stripped of alliance
		var archStatus string
		var archAlliance *int
		store.db.QueryRow("SELECT status, alliance_id FROM players WHERE player_id = 999").Scan(&archStatus, &archAlliance)
		assert.Equal(t, "Archived", archStatus)
		assert.Nil(t, archAlliance)

		// Verify Outbound record was created
		outboundRecords, _ := store.GetTransferRecords(seasonID)
		require.NoError(t, err, "Should not fail to fetch or scan records")
		require.Len(t, outboundRecords, 2, "Should now have 1 inbound and 1 outbound record")
	})
}
