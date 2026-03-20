package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"gift-redeemer/internal/config"
	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupFoundryTestRouter injects the strict *int required by getAllianceID()
func setupFoundryTestRouter(allianceId *int, username string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("username", username)
		if allianceId != nil {
			c.Set("allianceId", allianceId) // Must be *int for this controller
		}
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	cfg := &config.Config{} // Empty config, Discord bot token will be empty
	ctrl := NewFoundryController(testStore, cfg, sseBroker)

	r.GET("/foundry/state", ctrl.GetEventState)
	r.POST("/foundry/deploy", ctrl.DeployPlayer)
	r.POST("/foundry/lock", ctrl.LockEvent)
	r.POST("/foundry/attendance", ctrl.UpdateAttendance)
	r.POST("/foundry/reset", ctrl.ResetAndArchiveEvent)
	r.GET("/foundry/history", ctrl.GetEventHistory)
	r.GET("/foundry/history/:id", ctrl.GetEventInHistory)

	return r
}

func TestFoundryController_Lifecycle(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	// Seed an Alliance
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Foundry Fighters')")

	// Seed a Player (Archive logic uses JOIN on players table to grab the nickname)
	rawDB.Exec("INSERT INTO players (player_id, nickname, alliance_id, tundra_power) VALUES (999, 'Striker', 10, 5000000)")

	// Setup router for Alliance 10
	allianceID := 10
	router := setupFoundryTestRouter(&allianceID, "AdminBob")

	t.Run("DeployPlayer", func(t *testing.T) {
		legionID := 1
		payload := map[string]interface{}{
			"eventType": "Foundry",
			"playerId":  999,
			"legionId":  &legionID,
			"isSub":     false,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/foundry/deploy", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Deployed successfully")
	})

	t.Run("LockEvent", func(t *testing.T) {
		payload := map[string]interface{}{
			"eventType": "Foundry",
			"legionId":  1,
			"isLocked":  true,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/foundry/lock", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("UpdateAttendance", func(t *testing.T) {
		payload := map[string]interface{}{
			"eventType":  "Foundry",
			"playerId":   999,
			"attendance": "Attended",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/foundry/attendance", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("GetEventState (Verify Setup)", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/foundry/state?eventType=Foundry", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var state map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &state)
		require.NoError(t, err)

		// Verify Legion is locked
		legions := state["legions"].([]interface{})
		require.Len(t, legions, 1)
		assert.True(t, legions[0].(map[string]interface{})["isLocked"].(bool))

		// Verify Roster attendance
		roster := state["roster"].([]interface{})
		require.Len(t, roster, 1)
		assert.Equal(t, "Attended", roster[0].(map[string]interface{})["attendance"])
	})

	t.Run("ResetAndArchiveEvent", func(t *testing.T) {
		payload := map[string]interface{}{
			"eventType": "Foundry",
			"notes":     "Total Victory!",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/foundry/reset", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "archived and reset successfully")
	})

	t.Run("GetEventHistory & GetEventInHistory", func(t *testing.T) {
		// 1. Fetch History List
		req, _ := http.NewRequest("GET", "/foundry/history?eventType=Foundry", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var historyList []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &historyList)
		require.NoError(t, err)
		require.Len(t, historyList, 1)

		historyID := int(historyList[0]["id"].(float64))
		assert.Equal(t, "Total Victory!", historyList[0]["notes"])
		assert.Equal(t, "AdminBob", historyList[0]["createdBy"])

		// 2. Fetch specific History Snapshot
		reqSnap, _ := http.NewRequest("GET", "/foundry/history/"+strconv.Itoa(historyID), nil)
		wSnap := httptest.NewRecorder()
		router.ServeHTTP(wSnap, reqSnap)

		assert.Equal(t, http.StatusOK, wSnap.Code)

		var snapshot []map[string]interface{}
		err = json.Unmarshal(wSnap.Body.Bytes(), &snapshot)
		require.NoError(t, err)
		require.Len(t, snapshot, 1)

		assert.Equal(t, float64(999), snapshot[0]["playerId"])
		assert.Equal(t, "Striker", snapshot[0]["nickname"]) // Proves the JOIN worked during archive
		assert.Equal(t, "Attended", snapshot[0]["attendance"])
	})

	t.Run("Security - Missing Alliance Blocked", func(t *testing.T) {
		// Setup a router with NO alliance ID
		badRouter := setupFoundryTestRouter(nil, "Hacker")

		req, _ := http.NewRequest("GET", "/foundry/state?eventType=Foundry", nil)
		w := httptest.NewRecorder()
		badRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "Alliance required")
	})
}
