package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gift-redeemer/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupStrategyTestRouter() *gin.Engine {
	r := gin.Default()

	// Pass nil for Redis as it's not used in these specific endpoints
	ctrl := NewStrategyController(testStore, &config.Config{}, nil)

	r.GET("/strategy/heroes", ctrl.GetHeroes)
	r.POST("/strategy/meta", ctrl.SaveStrategy)
	r.GET("/strategy/active", ctrl.GetActiveStrategy)
	r.GET("/strategy/captains", ctrl.GetCaptains)
	r.GET("/strategy/pets", ctrl.GetPetSchedule)
	r.POST("/strategy/pets", ctrl.SavePetSchedule)

	// Simulating how you mount it in router.go
	r.GET("/shared-assets/heroes/:filename", ctrl.HeroIcon)

	return r
}

func TestStrategyController(t *testing.T) {
	resetDB(t)
	// --- 0. Hard Reset Leaked Tables ---
	tablesToClean := []string{
		"players", "teams", "heroes", "battle_strategy",
		"battle_strategy_heroes", "pet_skill_schedule",
	}
	for _, tbl := range tablesToClean {
		_, err := rawDB.Exec("TRUNCATE TABLE " + tbl)
		require.NoError(t, err, "Failed to truncate "+tbl)
	}

	router := setupStrategyTestRouter()

	// --- Seed the DB ---
	// 1. Heroes
	_, err := rawDB.Exec("INSERT INTO heroes (id, name, troop_type, local_image_path) VALUES (1, 'Natalia', 'Infantry', 'natalia.png')")
	require.NoError(t, err)

	// 2. Captains (Requires a Player and a Team where they are the captain)
	_, err = rawDB.Exec("INSERT INTO players (player_id, nickname) VALUES (999, 'Captain America')")
	require.NoError(t, err)
	_, err = rawDB.Exec("INSERT INTO teams (id, name, captain_fid) VALUES (1, 'Avenger Squad', 999)")
	require.NoError(t, err)

	t.Run("GetHeroes", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/strategy/heroes", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var heroes []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &heroes)
		require.NoError(t, err)
		require.Len(t, heroes, 1)
		assert.Equal(t, "Natalia", heroes[0]["name"])
	})

	t.Run("GetCaptains", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/strategy/captains", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var captains []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &captains)
		require.NoError(t, err)
		require.Len(t, captains, 1)
		assert.Equal(t, "Captain America", captains[0]["nickname"])
		assert.Equal(t, float64(999), captains[0]["fid"])
	})

	t.Run("SaveStrategy & GetActiveStrategy", func(t *testing.T) {
		// 1. Save Strategy
		payload := map[string]interface{}{
			"type":          "Attack",
			"infantryRatio": 40,
			"lancerRatio":   30,
			"marksmanRatio": 30,
			"leads":         []int{1, 0, 0},
			"joiners":       []int{0, 0, 0, 0},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/strategy/meta", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Strategy updated successfully")

		// 2. Fetch Active Strategy
		reqGet, _ := http.NewRequest("GET", "/strategy/active", nil)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)

		assert.Equal(t, http.StatusOK, wGet.Code)

		var activeMeta map[string]interface{}
		json.Unmarshal(wGet.Body.Bytes(), &activeMeta)

		// Extract the Attack payload
		attack := activeMeta["attack"].(map[string]interface{})
		assert.Equal(t, float64(40), attack["infantryRatio"])

		leads := attack["leads"].([]interface{})
		assert.Equal(t, float64(1), leads[0]) // Hero ID 1 (Natalia) in slot 1
	})

	t.Run("PetSchedule Lifecycle", func(t *testing.T) {
		tomorrow := time.Now().Add(24 * time.Hour).Format("2006-01-02")

		// 1. Save Pet Schedule
		payload := map[string]interface{}{
			"fightDate": tomorrow,
			"schedule": map[string][]int64{
				"1": {999},
				"2": {},
				"3": {},
			},
		}
		body, _ := json.Marshal(payload)

		reqSave, _ := http.NewRequest("POST", "/strategy/pets", bytes.NewBuffer(body))
		wSave := httptest.NewRecorder()
		router.ServeHTTP(wSave, reqSave)

		assert.Equal(t, http.StatusOK, wSave.Code)

		// 2. Get Pet Schedule (No query param -> Auto-fetches upcoming date)
		reqGet, _ := http.NewRequest("GET", "/strategy/pets", nil)
		wGet := httptest.NewRecorder()
		router.ServeHTTP(wGet, reqGet)

		assert.Equal(t, http.StatusOK, wGet.Code)

		var fetched map[string]interface{}
		json.Unmarshal(wGet.Body.Bytes(), &fetched)
		assert.Equal(t, tomorrow, fetched["date"])

		schedule := fetched["schedule"].(map[string]interface{})
		slot1 := schedule["1"].([]interface{})
		assert.Equal(t, float64(999), slot1[0])
	})

	t.Run("HeroIcon - Path Traversal Blocked", func(t *testing.T) {
		// We use a filename that includes ".." but won't be stripped by the HTTP client
		req, _ := http.NewRequest("GET", "/shared-assets/heroes/..malicious.png", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "Invalid file path")
	})

	t.Run("HeroIcon - Serve File", func(t *testing.T) {
		// 1. Create dummy directory and file
		err := os.MkdirAll(filepath.Join(".", "shared-assets", "heroes"), 0755)
		require.NoError(t, err)
		defer os.RemoveAll("./shared-assets") // Cleanup

		dummyPath := filepath.Join(".", "shared-assets", "heroes", "natalia.png")
		err = os.WriteFile(dummyPath, []byte("fake_image_bytes"), 0644)
		require.NoError(t, err)

		// 2. Fetch the file
		req, _ := http.NewRequest("GET", "/shared-assets/heroes/natalia.png", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "fake_image_bytes", w.Body.String())
	})
}
