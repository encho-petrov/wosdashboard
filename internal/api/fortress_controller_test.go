package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gift-redeemer/internal/config"
	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupFortressTestRouter() *gin.Engine {
	r := gin.Default()
	r.Use(MockAdminMiddleware()) // Provides userId for logAction

	// Mock Config for the Rotation math
	cfg := &config.Config{}
	cfg.Rotation.SeasonReferenceDate = "2024-01-01"
	cfg.Rotation.AnchorSeason = 1

	sseBroker := services.NewSSEBroker()
	ctrl := NewFortressController(testStore, cfg, sseBroker)

	r.GET("/buildings", ctrl.GetAllBuildings)
	r.GET("/schedule/:seasonId", ctrl.GetSeasonSchedule)
	r.GET("/rewards/:week", ctrl.GetWeeklyRewards)
	r.POST("/save", ctrl.UpdateSeason)
	r.GET("/seasons", ctrl.GetSeasonHistory)

	return r
}

func TestFortressController(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	// Seed Alliances
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Alpha Alliance')")

	// Seed Buildings
	rawDB.Exec("INSERT INTO buildings (id, internal_id, type) VALUES (1, 1, 'Stronghold')")
	rawDB.Exec("INSERT INTO buildings (id, internal_id, type) VALUES (2, 1, 'Fortress')")

	// Seed Rewards
	_, err := rawDB.Exec("INSERT INTO building_rewards (building_id, week_number, reward_name, reward_icon) VALUES (1, 1, 'Gold Chest', 'icon.png')")
	require.NoError(t, err, "Failed to seed building_rewards table")

	router := setupFortressTestRouter()

	t.Run("GetAllBuildings", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/buildings", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var buildings []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &buildings)
		require.NoError(t, err)
		require.Len(t, buildings, 2)

		// Assuming the DB package orders by type DESC, Stronghold might be first
		// We'll just check that IDs 1 and 2 exist
		var ids []float64
		for _, b := range buildings {
			ids = append(ids, b["id"].(float64))
		}
		assert.Contains(t, ids, float64(1))
		assert.Contains(t, ids, float64(2))
	})

	t.Run("GetWeeklyRewards", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/rewards/1", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var rewards []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &rewards)
		require.NoError(t, err)
		require.Len(t, rewards, 1)
		assert.Equal(t, "Gold Chest", rewards[0]["name"])
	})

	t.Run("UpdateSeason (Save Schedule)", func(t *testing.T) {
		// Create a valid schedule (Week 1, Max 1 Stronghold, Max 1 Fortress per DB logic)
		payload := map[string]interface{}{
			"seasonId": 5,
			"entries": []map[string]interface{}{
				{
					"seasonId":   5,
					"week":       1,
					"buildingId": 1, // Stronghold
					"allianceId": 10,
				},
				{
					"seasonId":   5,
					"week":       1,
					"buildingId": 2, // Fortress
					"allianceId": 10,
				},
			},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/save", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "updated successfully")

		// Verify Audit Log was created via logAction
		var logCount int
		rawDB.QueryRow("SELECT COUNT(*) FROM audit_logs WHERE action = 'UPDATE_ROTATION'").Scan(&logCount)
		assert.Equal(t, 1, logCount)
	})

	t.Run("GetSeasonSchedule", func(t *testing.T) {
		// Fetch the schedule for Season 5 that we just saved
		req, _ := http.NewRequest("GET", "/schedule/5", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var schedule []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &schedule)
		require.NoError(t, err)
		require.Len(t, schedule, 2)
		assert.Equal(t, float64(10), schedule[0]["allianceId"])
	})

	t.Run("GetSeasonHistory", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/seasons", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var history map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &history)
		require.NoError(t, err)

		// It should contain our explicitly saved Season 5 inside availableSeasons
		available := history["availableSeasons"].([]interface{})
		var foundSeason5 bool
		for _, s := range available {
			if s.(float64) == 5 {
				foundSeason5 = true
				break
			}
		}
		assert.True(t, foundSeason5, "Season 5 should be in the history list")

		// liveSeason should be populated based on the mocked anchor date
		require.NotNil(t, history["liveSeason"])
	})
}
