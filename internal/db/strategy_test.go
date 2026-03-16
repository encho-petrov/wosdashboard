package db

import (
	"testing"
	"time"

	"gift-redeemer/internal/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStrategySuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// --- Seed Ecosystem ---
	// Heroes
	store.db.Exec("INSERT INTO heroes (id, name, troop_type, local_image_path) VALUES (1, 'Natalia', 'Infantry', './natalia.png'), (2, 'Jeronimo', 'Infantry','./jeronimo.png'), (3, 'Mia', 'Marksman','/mia.png')")

	// Alliances & Players for Captains
	store.db.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Alpha')")
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id, avatar_image, stove_lv_content) VALUES (101, 'Cap1', 10, '', '')")
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id, avatar_image, stove_lv_content) VALUES (102, 'Cap2', 10, '', '')")

	// Team with Captain
	store.db.Exec("INSERT INTO teams (id, name, captain_fid) VALUES (1, 'Team A', 101)")
	store.db.Exec("INSERT INTO teams (id, name, captain_fid) VALUES (2, 'Team B', 102)")

	t.Run("Get Heroes", func(t *testing.T) {
		heroes, err := store.GetHeroes()
		require.NoError(t, err)
		require.Len(t, heroes, 3)
		assert.Equal(t, "Jeronimo", heroes[0].Name) // Ordered alphabetically
	})

	t.Run("Save and Get Battle Strategy (with MapData JSON)", func(t *testing.T) {
		// 1. Construct an Attack Strategy with MapData
		req := models.BattleMetaRequest{
			Type:          "Attack",
			InfantryRatio: 40,
			LancerRatio:   30,
			MarksmanRatio: 30,
			Leads:         []int{1, 2, 0},    // Natalia, Jeronimo in slots 1, 2
			Joiners:       []int{3, 0, 0, 0}, // Mia in slot 1
			MapData: map[string]interface{}{
				"hq_target": "X:123 Y:456",
				"markers":   []interface{}{"A", "B"},
			},
		}

		// 2. Save it
		stratID, err := store.SaveBattleStrategy(req)
		require.NoError(t, err)
		assert.NotZero(t, stratID)

		// 3. Fetch Active Strategy and verify reconstruction
		resp, err := store.GetActiveStrategy()
		require.NoError(t, err)
		require.NotNil(t, resp)
		require.NotNil(t, resp.Attack)

		// Verify Ratios
		assert.Equal(t, 40, resp.Attack.InfantryRatio)

		// Verify Hero mapping (Slot arrays are 0-indexed in Go, but 1-indexed in DB)
		assert.Equal(t, 1, resp.Attack.Leads[0])
		assert.Equal(t, 2, resp.Attack.Leads[1])
		assert.Equal(t, 3, resp.Attack.Joiners[0])

		// Verify JSON MapData unmarshaled correctly
		require.NotNil(t, resp.MapData)
		assert.Equal(t, "X:123 Y:456", resp.MapData["hq_target"])
	})

	t.Run("Get Active Captains", func(t *testing.T) {
		captains, err := store.GetActiveCaptains()
		require.NoError(t, err)
		require.Len(t, captains, 2)
		assert.Equal(t, "Alpha", *captains[0].AllianceName)
	})

	t.Run("Pet Schedule Lifecycle", func(t *testing.T) {
		// Use a date strictly in the future to test GetUpcomingPetScheduleDate
		futureDate := time.Now().Add(48 * time.Hour).Format("2006-01-02")

		// 1. Save Schedule
		scheduleReq := PetScheduleRequest{
			FightDate: futureDate,
			Schedule: map[string][]int64{
				"1": {101},
				"2": {101, 102},
				"3": {},
			},
		}
		err := store.SavePetSchedule(scheduleReq)
		require.NoError(t, err)

		// 2. Get Schedule By Date (Returns raw map)
		scheduleMap, err := store.GetPetScheduleByDate(futureDate)
		require.NoError(t, err)
		assert.Len(t, scheduleMap["1"], 1)
		assert.Len(t, scheduleMap["2"], 2)
		assert.Len(t, scheduleMap["3"], 0)

		// 3. Get Captains For Pet Slot (Returns hydrated badges)
		slot2Captains, err := store.GetCaptainsForPetSlot(futureDate, 2)
		require.NoError(t, err)
		require.Len(t, slot2Captains, 2)
		assert.Equal(t, int64(101), slot2Captains[0].Fid) // Cap1

		// 4. Get Upcoming Date
		upcoming, err := store.GetUpcomingPetScheduleDate()
		require.NoError(t, err)
		assert.Equal(t, futureDate, upcoming)
	})
}
