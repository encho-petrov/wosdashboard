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

func setupWarTestRouter(role string, username string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("role", role)
		c.Set("username", username)
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	// Pass nil for PlayerClient since we will manually seed the database to avoid external HTTP calls
	ctrl := NewWarController(testStore, &config.Config{}, nil, sseBroker)

	r.POST("/war-room/session", ctrl.SetWarSession)
	r.POST("/war-room/deploy", ctrl.DeployToWarRoom)
	r.POST("/war-room/lock", ctrl.LockWarRoom)
	r.POST("/war-room/reset", ctrl.ArchiveAndResetEvent)

	r.GET("/players", ctrl.GetPlayerRoster)
	r.PUT("/players/:fid", ctrl.UpdatePlayer)

	r.POST("/squads/promote", ctrl.PromoteCaptain)
	r.POST("/squads/assign", ctrl.AssignPlayerToSquad)

	return r
}

func TestWarController(t *testing.T) {
	resetDB(t)

	// --- 0. Hard Reset Leaked Tables ---
	tablesToClean := []string{
		"players", "teams", "alliances", "users", "war_room_state",
		"war_room_attendance", "event_snapshots", "history_teams", "history_players",
	}
	for _, tbl := range tablesToClean {
		_, err := rawDB.Exec("TRUNCATE TABLE " + tbl)
		require.NoError(t, err, "Failed to truncate "+tbl)
	}

	// --- Seed the DB ---
	// Seed Alliances
	rawDB.Exec("INSERT INTO alliances (id, name, type) VALUES (10, 'Main Home', 'Farming')")
	rawDB.Exec("INSERT INTO alliances (id, name, type) VALUES (20, 'War Academy', 'Fighting')")

	// Seed Users (GetPlayerRoster relies on fetching the calling User from the DB!)
	rawDB.Exec("INSERT INTO users (id, username, role, alliance_id) VALUES (1, 'WarAdmin', 'admin', NULL)")
	rawDB.Exec("INSERT INTO users (id, username, role, alliance_id) VALUES (2, 'R4Commander', 'user', 10)")

	// Seed Players
	rawDB.Exec("INSERT INTO players (player_id, nickname, alliance_id, tundra_power) VALUES (111, 'Striker', 10, 5000000)")
	rawDB.Exec("INSERT INTO players (player_id, nickname, alliance_id, tundra_power) VALUES (222, 'Defender', 20, 6000000)")

	// Seed War Room State (Ensure the singleton row exists)
	rawDB.Exec("INSERT IGNORE INTO war_room_state (id, active_event_type) VALUES (1, NULL)")

	adminRouter := setupWarTestRouter("admin", "WarAdmin")
	userRouter := setupWarTestRouter("user", "R4Commander")

	t.Run("GetPlayerRoster - Security & Isolation", func(t *testing.T) {
		// 1. Admin sees everyone (Both Striker and Defender)
		reqAdmin, _ := http.NewRequest("GET", "/players", nil)
		wAdmin := httptest.NewRecorder()
		adminRouter.ServeHTTP(wAdmin, reqAdmin)

		assert.Equal(t, http.StatusOK, wAdmin.Code)
		var adminRoster []map[string]interface{}
		json.Unmarshal(wAdmin.Body.Bytes(), &adminRoster)
		assert.Len(t, adminRoster, 2)

		// 2. R4 Commander (Alliance 10) only sees Striker
		reqUser, _ := http.NewRequest("GET", "/players", nil)
		wUser := httptest.NewRecorder()
		userRouter.ServeHTTP(wUser, reqUser)

		assert.Equal(t, http.StatusOK, wUser.Code)
		var userRoster []map[string]interface{}
		json.Unmarshal(wUser.Body.Bytes(), &userRoster)
		assert.Len(t, userRoster, 1)
		assert.Equal(t, "Striker", userRoster[0]["nickname"])
	})

	t.Run("UpdatePlayer", func(t *testing.T) {
		targetAlliance := 20
		payload := map[string]interface{}{
			"power":              9999999,
			"troopType":          "Infantry",
			"battleAvailability": "Available",
			"avail_1900":         true,
			"allianceId":         &targetAlliance,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/players/111", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Player updated")

		// Verify in DB
		var power int64
		var avail1900 bool
		rawDB.QueryRow("SELECT tundra_power, avail_1900 FROM players WHERE player_id = 111").Scan(&power, &avail1900)
		assert.Equal(t, int64(9999999), power)
		assert.True(t, avail1900)
	})

	t.Run("Squads Lifecycle (Promote & Assign)", func(t *testing.T) {
		// 1. Promote Striker to Captain of Alliance 10
		promoPayload := map[string]interface{}{"fid": 111, "allianceId": 10}
		promoBody, _ := json.Marshal(promoPayload)

		reqPromo, _ := http.NewRequest("POST", "/squads/promote", bytes.NewBuffer(promoBody))
		wPromo := httptest.NewRecorder()
		adminRouter.ServeHTTP(wPromo, reqPromo)

		assert.Equal(t, http.StatusOK, wPromo.Code)

		// Grab the newly created Team ID
		var teamID int
		err := rawDB.QueryRow("SELECT id FROM teams WHERE captain_fid = 111 LIMIT 1").Scan(&teamID)
		require.NoError(t, err)

		// 2. Assign Defender to Striker's Squad
		assignPayload := map[string]interface{}{"fid": 222, "teamId": teamID}
		assignBody, _ := json.Marshal(assignPayload)

		reqAssign, _ := http.NewRequest("POST", "/squads/assign", bytes.NewBuffer(assignBody))
		wAssign := httptest.NewRecorder()
		adminRouter.ServeHTTP(wAssign, reqAssign)

		assert.Equal(t, http.StatusOK, wAssign.Code)

		// Verify in DB
		var assignedTeamID int
		rawDB.QueryRow("SELECT team_id FROM players WHERE player_id = 222").Scan(&assignedTeamID)
		assert.Equal(t, teamID, assignedTeamID)
	})

	t.Run("War Room: Set Session & Deploy", func(t *testing.T) {
		// 1. Set Session to SvS
		sessionPayload := map[string]interface{}{"eventType": "SvS"}
		sessionBody, _ := json.Marshal(sessionPayload)

		reqSess, _ := http.NewRequest("POST", "/war-room/session", bytes.NewBuffer(sessionBody))
		wSess := httptest.NewRecorder()
		adminRouter.ServeHTTP(wSess, reqSess)

		assert.Equal(t, http.StatusOK, wSess.Code)

		// 2. Deploy Striker to the War Academy (Alliance 20)
		targetAlliance := 20
		deployPayload := map[string]interface{}{
			"playerIds":  []int64{111},
			"allianceId": &targetAlliance,
		}
		deployBody, _ := json.Marshal(deployPayload)

		reqDep, _ := http.NewRequest("POST", "/war-room/deploy", bytes.NewBuffer(deployBody))
		wDep := httptest.NewRecorder()
		adminRouter.ServeHTTP(wDep, reqDep)

		assert.Equal(t, http.StatusOK, wDep.Code)

		// Verify Fighting Alliance was set in DB
		var fightingID int
		rawDB.QueryRow("SELECT fighting_alliance_id FROM players WHERE player_id = 111").Scan(&fightingID)
		assert.Equal(t, 20, fightingID)
	})

	t.Run("War Room: Archive Event", func(t *testing.T) {
		// Submit the archive payload with attendance records
		payload := map[string]interface{}{
			"eventType": "SvS",
			"notes":     "Total Domination",
			"attendance": []map[string]interface{}{
				{"fid": 111, "status": "Attended"},
				{"fid": 222, "status": "Missed"},
			},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/war-room/reset", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Event archived")

		// 1. Verify Event Snapshot was created
		var snapshotNotes string
		err := rawDB.QueryRow("SELECT notes FROM event_snapshots ORDER BY id DESC LIMIT 1").Scan(&snapshotNotes)
		require.NoError(t, err)
		assert.Equal(t, "Total Domination", snapshotNotes)

		// 2. Verify Troops returned to reserve (fighting_alliance_id reset to NULL)
		var fightingID *int
		rawDB.QueryRow("SELECT fighting_alliance_id FROM players WHERE player_id = 111").Scan(&fightingID)
		assert.Nil(t, fightingID, "Troops should be returned to reserve after an archive")
	})
}
