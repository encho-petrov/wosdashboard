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

func setupTransfersTestRouter(role string, allianceId int) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("role", role)
		c.Set("allianceId", allianceId) // Storing as int for testing purposes
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	// Pass nil for PlayerClient since we will manually seed the database to avoid external HTTP calls
	ctrl := NewTransfersController(testStore, &config.Config{}, nil, sseBroker)

	r.GET("/transfers/active", ctrl.GetActiveSeason)
	r.POST("/transfers/seasons", ctrl.CreateTransferSeason)
	r.PUT("/transfers/:id", ctrl.UpdateTransferRecord)
	r.POST("/transfers/:id/confirm-inbound", ctrl.ConfirmTransfer)
	r.PUT("/transfers/seasons/:id/status", ctrl.UpdateSeasonStatus)
	r.GET("/transfers/history", ctrl.GetTransferHistory)
	r.GET("/transfers/seasons/:id/records", ctrl.GetTransferRecords)
	r.POST("/transfers/players/:fid/transfer-out", ctrl.ConfirmOutbandTransfer)
	r.PUT("/transfers/seasons/:id", ctrl.EditTransferSeason)

	return r
}

func TestTransfersController(t *testing.T) {
	resetDB(t)

	// --- 0. Hard Reset Leaked Tables ---
	tablesToClean := []string{
		"transfer_seasons", "transfer_records", "players", "alliances", "audit_logs",
	}
	for _, tbl := range tablesToClean {
		_, err := rawDB.Exec("TRUNCATE TABLE " + tbl)
		require.NoError(t, err, "Failed to truncate "+tbl)
	}

	// --- Seed the DB ---
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Target Alliance')")
	rawDB.Exec("INSERT INTO players (player_id, nickname, alliance_id, status) VALUES (999, 'Traitor', 10, 'Active')")

	router := setupTransfersTestRouter("admin", 10)

	t.Run("CreateTransferSeason", func(t *testing.T) {
		payload := map[string]interface{}{
			"name":     "Season 5",
			"powerCap": 500000000,
			"leading":  true,
			"specials": 3,
			"normals":  15,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/transfers/seasons", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("GetActiveSeason", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/transfers/active", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)

		season := resp["season"].(map[string]interface{})
		assert.Equal(t, "Season 5", season["name"])
		assert.Equal(t, float64(3), season["specialInvitesAvailable"])
	})

	t.Run("EditTransferSeason", func(t *testing.T) {
		// Grab the ID
		var seasonID int
		rawDB.QueryRow("SELECT id FROM transfer_seasons LIMIT 1").Scan(&seasonID)

		payload := map[string]interface{}{
			"powerCap": 600000000,
			"specials": 5,
			"normals":  20,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/transfers/seasons/"+strconv.Itoa(seasonID), bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "parameters updated")
	})

	t.Run("Transfer Lifecycle: Records & Confirmations", func(t *testing.T) {
		var seasonID int
		rawDB.QueryRow("SELECT id FROM transfer_seasons LIMIT 1").Scan(&seasonID)

		// Seed a pending inbound record
		_, err := rawDB.Exec(`
            INSERT INTO transfer_records (season_id, fid, direction, nickname, status) 
            VALUES (?, 888, 'Inbound', 'NewGuy', 'Pending')`, seasonID)
		require.NoError(t, err)

		var recordID int
		rawDB.QueryRow("SELECT id FROM transfer_records WHERE fid = 888").Scan(&recordID)

		// 1. Update the Record
		targetAlliance := 10
		updatePayload := map[string]interface{}{
			"power":            1500000,
			"targetAllianceId": targetAlliance,
			"inviteType":       "Normal",
			"status":           "Pending",
		}
		updateBody, _ := json.Marshal(updatePayload)

		reqUpd, _ := http.NewRequest("PUT", "/transfers/"+strconv.Itoa(recordID), bytes.NewBuffer(updateBody))
		wUpd := httptest.NewRecorder()
		router.ServeHTTP(wUpd, reqUpd)
		assert.Equal(t, http.StatusOK, wUpd.Code)

		// 2. Confirm Inbound Transfer
		confirmPayload := map[string]interface{}{
			"fid":              888,
			"nickname":         "NewGuy",
			"targetAllianceId": 10,
		}
		confirmBody, _ := json.Marshal(confirmPayload)

		reqConf, _ := http.NewRequest("POST", "/transfers/"+strconv.Itoa(recordID)+"/confirm-inbound", bytes.NewBuffer(confirmBody))
		wConf := httptest.NewRecorder()
		router.ServeHTTP(wConf, reqConf)

		assert.Equal(t, http.StatusOK, wConf.Code)

		// Verify Player was successfully added to the roster
		var rosterCount int
		rawDB.QueryRow("SELECT COUNT(*) FROM players WHERE player_id = 888").Scan(&rosterCount)
		assert.Equal(t, 1, rosterCount)

		// 3. Confirm Outbound Transfer (Using the seeded 'Traitor' player)
		outPayload := map[string]interface{}{
			"seasonId":  seasonID,
			"nickname":  "Traitor",
			"destState": "State 400",
		}
		outBody, _ := json.Marshal(outPayload)

		reqOut, _ := http.NewRequest("POST", "/transfers/players/999/transfer-out", bytes.NewBuffer(outBody))
		wOut := httptest.NewRecorder()
		router.ServeHTTP(wOut, reqOut)

		assert.Equal(t, http.StatusOK, wOut.Code)

		// Verify player was archived
		var status string
		rawDB.QueryRow("SELECT status FROM players WHERE player_id = 999").Scan(&status)
		assert.Equal(t, "Archived", status)
	})

	t.Run("UpdateSeasonStatus & History", func(t *testing.T) {
		var seasonID int
		rawDB.QueryRow("SELECT id FROM transfer_seasons LIMIT 1").Scan(&seasonID)

		// 1. Close Season
		payload := map[string]interface{}{"status": "Closed"}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/transfers/seasons/"+strconv.Itoa(seasonID)+"/status", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)

		// 2. Fetch History
		reqHist, _ := http.NewRequest("GET", "/transfers/history", nil)
		wHist := httptest.NewRecorder()
		router.ServeHTTP(wHist, reqHist)

		assert.Equal(t, http.StatusOK, wHist.Code)

		var history []map[string]interface{}
		json.Unmarshal(wHist.Body.Bytes(), &history)
		require.Len(t, history, 1)
		assert.Equal(t, "Season 5", history[0]["name"])
	})
}
