package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupMinistryTestRouter allows us to test both Admin and User roles
func setupMinistryTestRouter(role string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("userId", int64(1))
		c.Set("username", "TestCommander")
		c.Set("role", role)
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	ctrl := NewMinistryController(testStore, sseBroker)

	r.GET("/ministry/active", ctrl.GetActiveEvent)
	r.POST("/ministry/events", ctrl.CreateEvent)
	r.PUT("/ministry/events/:id/status", ctrl.UpdateActiveEvent)
	r.PUT("/ministry/slots/:id", ctrl.UpdateMinistrySlot)
	r.PUT("/ministry/events/:id/announce", ctrl.ToggleNotifications)
	r.GET("/ministry/history", ctrl.GetHistory)
	r.GET("/ministry/history/:id", ctrl.GetHistorySlots)

	return r
}

func TestMinistryController_Lifecycle(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Ministry Elite')")
	rawDB.Exec("INSERT INTO players (player_id, nickname, alliance_id) VALUES (555, 'MinisterBob', 10)")

	adminRouter := setupMinistryTestRouter("admin")
	userRouter := setupMinistryTestRouter("user")

	t.Run("Security - Non-Admin Blocked from Creating Event", func(t *testing.T) {
		payload := map[string]interface{}{} // Empty is fine, should fail on role check first
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/ministry/events", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		userRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("CreateEvent - Admin Success", func(t *testing.T) {
		payload := map[string]interface{}{
			"title":           "Spring Ministry",
			"announceEnabled": true,
			"days": []map[string]interface{}{
				{"buffName": "Construction", "activeDate": "2026-04-01"},
			},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/ministry/events", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Event created and slots generated")

		// Verify DB generated exactly 48 slots for the single day
		var slotCount int
		rawDB.QueryRow("SELECT COUNT(*) FROM ministry_slots").Scan(&slotCount)
		assert.Equal(t, 48, slotCount)
	})

	t.Run("GetActiveEvent", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/ministry/active", nil)
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		event := response["event"].(map[string]interface{})
		assert.Equal(t, "Spring Ministry", event["title"])

		schedule := response["schedule"].([]interface{})
		require.Len(t, schedule, 1)

		day := schedule[0].(map[string]interface{})
		slots := day["slots"].([]interface{})
		assert.Len(t, slots, 48)
	})

	t.Run("UpdateMinistrySlot", func(t *testing.T) {
		// Fetch the first slot ID directly from the DB
		var slotID int
		err := rawDB.QueryRow("SELECT id FROM ministry_slots LIMIT 1").Scan(&slotID)
		require.NoError(t, err)

		playerFid := int64(555)
		payload := map[string]interface{}{
			"playerFid": &playerFid,
			"nickname":  "MinisterBob",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/ministry/slots/"+strconv.Itoa(slotID), bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify slot was assigned
		var assignedFid int64
		rawDB.QueryRow("SELECT player_fid FROM ministry_slots WHERE id = ?", slotID).Scan(&assignedFid)
		assert.Equal(t, int64(555), assignedFid)
	})

	t.Run("ToggleNotifications", func(t *testing.T) {
		var eventID int
		rawDB.QueryRow("SELECT id FROM ministry_events LIMIT 1").Scan(&eventID)

		payload := map[string]interface{}{
			"announceEnabled": false,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/ministry/events/"+strconv.Itoa(eventID)+"/announce", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("UpdateActiveEvent (Close Event)", func(t *testing.T) {
		var eventID int
		rawDB.QueryRow("SELECT id FROM ministry_events LIMIT 1").Scan(&eventID)

		payload := map[string]interface{}{
			"status": "Closed",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/ministry/events/"+strconv.Itoa(eventID)+"/status", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("GetHistory & GetHistorySlots", func(t *testing.T) {
		// 1. Fetch History List
		req, _ := http.NewRequest("GET", "/ministry/history", nil)
		w := httptest.NewRecorder()
		adminRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var events []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &events)
		require.NoError(t, err)
		require.Len(t, events, 1)

		eventID := int(events[0]["id"].(float64))

		// 2. Fetch specific History Schedule
		reqSlots, _ := http.NewRequest("GET", "/ministry/history/"+strconv.Itoa(eventID), nil)
		wSlots := httptest.NewRecorder()
		adminRouter.ServeHTTP(wSlots, reqSlots)

		assert.Equal(t, http.StatusOK, wSlots.Code)

		var schedule []map[string]interface{}
		err = json.Unmarshal(wSlots.Body.Bytes(), &schedule)
		require.NoError(t, err)
		require.Len(t, schedule, 1)                              // 1 day
		require.Len(t, schedule[0]["slots"].([]interface{}), 48) // 48 slots attached to that day
	})
}
