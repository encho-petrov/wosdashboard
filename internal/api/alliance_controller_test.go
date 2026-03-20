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

// setupAllianceTestRouter allows us to inject custom context values for different test scenarios
func setupAllianceTestRouter(userId int64, role string, allianceId *int) *gin.Engine {
	r := gin.Default()

	// Custom middleware to inject the exact context state we want to test
	r.Use(func(c *gin.Context) {
		c.Set("userId", userId)
		c.Set("role", role)
		if allianceId != nil {
			c.Set("allianceId", allianceId)
		}
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	ctrl := NewAllianceController(testStore, sseBroker)

	r.POST("/admin/request", ctrl.HandleTransferRequest)
	r.GET("/admin/pending", ctrl.GetNotifications)
	r.PUT("/admin/:id/resolve", ctrl.HandleResolve)

	return r
}

func TestAllianceController_TransferLifecycle(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	// Seed Alliances
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Alpha Alliance'), (20, 'Beta Alliance')")

	// Seed Users
	// User 1: The Admin doing the resolving
	// User 2: Target User (Currently in Alpha, wants to move to Beta)
	// User 3: Target User to be unassigned
	rawDB.Exec("INSERT INTO users (id, username, alliance_id) VALUES (2, 'TargetUser', 10)")
	rawDB.Exec("INSERT INTO users (id, username, alliance_id) VALUES (3, 'LeaverUser', 10)")

	// Router setup for an Admin
	router := setupAllianceTestRouter(1, "admin", nil)

	t.Run("HandleTransferRequest - Unassign User (Auto-Approve)", func(t *testing.T) {
		// Payload with ToAllianceID = nil
		payload := map[string]interface{}{
			"targetUserId": 3,
			"toAllianceId": nil,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/admin/request", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "User unassigned successfully")

		// Verify in DB that User 3's alliance is now NULL
		var allianceID *int
		err := rawDB.QueryRow("SELECT alliance_id FROM users WHERE id = 3").Scan(&allianceID)
		require.NoError(t, err)
		assert.Nil(t, allianceID)
	})

	t.Run("HandleTransferRequest - Submit Pending Transfer", func(t *testing.T) {
		// Payload moving User 2 to Alliance 20
		payload := map[string]interface{}{
			"targetUserId": 2,
			"toAllianceId": 20,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/admin/request", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Transfer request submitted for approval")
	})

	t.Run("GetNotifications - Admin Fetch Pending Transfers", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/admin/pending", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var notifications []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &notifications)
		require.NoError(t, err)

		// Should find the pending transfer we just created
		require.Len(t, notifications, 1)
		assert.Equal(t, "Pending", notifications[0]["status"])
		assert.Equal(t, float64(2), notifications[0]["targetUserId"]) // JSON unmarshals numbers to float64
	})

	t.Run("HandleResolve - Approve Transfer", func(t *testing.T) {
		// We need the ID of the pending transfer we just made
		var transferID int
		err := rawDB.QueryRow("SELECT id FROM alliance_transfers WHERE status = 'Pending' LIMIT 1").Scan(&transferID)
		require.NoError(t, err)

		payload := map[string]interface{}{
			"status": "Approved",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/admin/"+strconv.Itoa(transferID)+"/resolve", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Transfer Approved")

		// Verify in DB that User 2 was actually moved to Alliance 20
		var newAllianceID *int
		err = rawDB.QueryRow("SELECT alliance_id FROM users WHERE id = 2").Scan(&newAllianceID)
		require.NoError(t, err)
		require.NotNil(t, newAllianceID)
		assert.Equal(t, 20, *newAllianceID)
	})

	t.Run("HandleResolve - Non-Admin Blocked", func(t *testing.T) {
		// Create a new router representing a regular user
		userRouter := setupAllianceTestRouter(99, "user", nil)

		payload := map[string]interface{}{
			"status": "Approved",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("PUT", "/admin/1/resolve", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		userRouter.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "Only admins can resolve transfers")
	})
}
