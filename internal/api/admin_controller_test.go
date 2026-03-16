package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAdminTestRouter() *gin.Engine {
	r := gin.Default()
	r.Use(MockAdminMiddleware())

	sseBroker := services.NewSSEBroker()
	adminCtrl := NewAdminController(testStore, sseBroker)

	r.GET("/admin/alliances", adminCtrl.ListAlliances)
	r.POST("/admin/alliances", adminCtrl.CreateAlliance)
	r.DELETE("/admin/alliances/:id", adminCtrl.DeleteAlliance)

	r.GET("/admin/users", adminCtrl.GetAllUsers)
	r.POST("/admin/users", adminCtrl.CreateUser)
	r.DELETE("/admin/users/:id", adminCtrl.DeleteUser)

	return r
}

func TestAdminController_Alliances(t *testing.T) {
	resetDB(t)
	router := setupAdminTestRouter()

	t.Run("Create Alliance", func(t *testing.T) {
		payload := map[string]string{"name": "Test Alliance", "type": "Fighting"}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/admin/alliances", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Alliance created successfully")
	})

	t.Run("List Alliances", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/admin/alliances", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		require.Len(t, response, 1)
		assert.Equal(t, "Test Alliance", response[0]["name"])
	})

	t.Run("Delete Alliance", func(t *testing.T) {
		// Fetch ID 1 based on auto-increment from Create test
		req, _ := http.NewRequest("DELETE", "/admin/alliances/1", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Alliance deleted")
	})
}

func TestAdminController_Users(t *testing.T) {
	resetDB(t)
	router := setupAdminTestRouter()

	t.Run("Create User", func(t *testing.T) {
		payload := map[string]interface{}{
			"username": "NewAdmin",
			"password": "securepassword",
			"role":     "admin",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/admin/users", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Contains(t, w.Body.String(), "User created successfully")
	})

	t.Run("Prevent Master Admin Deletion", func(t *testing.T) {
		// Attempt to delete ID 1 (Master Admin seeded in resetDB)
		req, _ := http.NewRequest("DELETE", "/admin/users/1", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "master admin account cannot be deleted")
	})
}
