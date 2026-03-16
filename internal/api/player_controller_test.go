package api

import (
	"encoding/json"
	"gift-redeemer/internal/services"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gift-redeemer/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupPlayerTestRouter allows us to mock the role and the JWT username (which acts as the player's FID)
func setupPlayerTestRouter(role string, usernameFID string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("role", role)
		c.Set("username", usernameFID)
		c.Next()
	})

	// Mock Config for the Rotation math (Force it to Season 1, Week 1 for predictability)
	cfg := &config.Config{}
	cfg.Rotation.SeasonReferenceDate = time.Now().Add(-24 * time.Hour).Format("2006-01-02") // Yesterday
	cfg.Rotation.AnchorSeason = 1

	ctrl := NewPlayerController(testStore, cfg)

	r.GET("/player/me", ctrl.GetPlayerInfo)
	r.GET("/player/dashboard", ctrl.GetPlayerDashboard)

	return r
}

func TestPlayerController(t *testing.T) {
	resetDB(t)

	// --- 0. Hard Reset Leaked Tables ---
	// Wipe tables that might contain leftover data from other test suites
	tablesToClean := []string{
		"players", "teams", "ministry_events", "ministry_days",
		"ministry_slots", "buildings", "building_rewards", "rotation_schedule",
	}
	for _, tbl := range tablesToClean {
		_, err := rawDB.Exec("TRUNCATE TABLE " + tbl)
		require.NoError(t, err, "Failed to truncate "+tbl)
	}

	// --- Seed the DB ---
	// 1. Alliances & Teams
	_, err := rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Player Alliance')")
	require.NoError(t, err)
	_, err = rawDB.Exec("INSERT INTO teams (id, name, captain_fid, alliance_id) VALUES (5, 'Alpha Squad', 1001, 10)")
	require.NoError(t, err)

	// 2. Players
	_, err = rawDB.Exec(`INSERT INTO players (player_id, nickname, avatar_image, stove_lv_content, alliance_id, team_id) 
                VALUES (1001, 'MainPlayer', 'avatar1.png', 'stove.png', 10, 5)`)
	require.NoError(t, err)
	_, err = rawDB.Exec(`INSERT INTO players (player_id, nickname, avatar_image, stove_lv_content, alliance_id, team_id) 
                VALUES (1002, 'TeammateGuy', 'avatar2.png', 'stove.png', 10, 5)`)
	require.NoError(t, err)

	// 3. Ministry Slot
	_, err = rawDB.Exec("INSERT INTO ministry_events (id, title, status) VALUES (1, 'Test Event', 'Active')")
	require.NoError(t, err)
	_, err = rawDB.Exec("INSERT INTO ministry_days (id, event_id, buff_name, active_date) VALUES (1, 1, 'Construction', '2026-03-20')")
	require.NoError(t, err)
	_, err = rawDB.Exec("INSERT INTO ministry_slots (day_id, slot_index, player_fid) VALUES (1, 0, 1001)")
	require.NoError(t, err)

	// 4. Fortress Rotation
	mockCfg := &config.Config{}
	mockCfg.Rotation.SeasonReferenceDate = time.Now().Add(-24 * time.Hour).Format("2006-01-02")
	mockCfg.Rotation.AnchorSeason = 1

	liveSeason, liveWeek := services.GetRotationState(mockCfg.Rotation.SeasonReferenceDate, mockCfg.Rotation.AnchorSeason)

	_, err = rawDB.Exec("INSERT INTO buildings (id, internal_id, type) VALUES (1, 1, 'Fortress')")
	require.NoError(t, err)

	_, err = rawDB.Exec("INSERT INTO building_rewards (building_id, week_number, reward_name, reward_icon) VALUES (1, ?, 'Epic Chest', 'epic.png')", liveWeek)
	require.NoError(t, err)

	_, err = rawDB.Exec("INSERT INTO rotation_schedule (season_id, week_number, building_id, alliance_id) VALUES (?, ?, 1, 10)", liveSeason, liveWeek)
	require.NoError(t, err)

	t.Run("GetPlayerInfo - Success", func(t *testing.T) {
		router := setupPlayerTestRouter("player", "1001")

		req, _ := http.NewRequest("GET", "/player/me", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var profile map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &profile)
		require.NoError(t, err)

		assert.Equal(t, "MainPlayer", profile["nickname"])
		assert.Equal(t, float64(1001), profile["fid"])
	})

	t.Run("GetPlayerInfo - Forbidden for Admins", func(t *testing.T) {
		router := setupPlayerTestRouter("admin", "1001")

		req, _ := http.NewRequest("GET", "/player/me", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("GetPlayerDashboard - Aggregation Check", func(t *testing.T) {
		router := setupPlayerTestRouter("player", "1001")

		req, _ := http.NewRequest("GET", "/player/dashboard", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var dashboard map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &dashboard)
		require.NoError(t, err)

		// 1. Check Player Data
		player := dashboard["player"].(map[string]interface{})
		assert.Equal(t, "MainPlayer", player["nickname"])

		// 2. Check Teammates
		teammates := dashboard["teammates"].([]interface{})
		require.Len(t, teammates, 1)
		assert.Equal(t, float64(1002), teammates[0].(map[string]interface{})["fid"])

		// 3. Check Ministry Slots
		ministries := dashboard["ministries"].([]interface{})
		require.Len(t, ministries, 1)
		assert.Equal(t, "Construction", ministries[0].(map[string]interface{})["buffName"])

		// 4. Check Fortress Rotations
		forts := dashboard["forts"].([]interface{})
		require.Len(t, forts, 1, "Forts array should not be empty")
		assert.Equal(t, "Fortress", forts[0].(map[string]interface{})["buildingType"])
	})
}
