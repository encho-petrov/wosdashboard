package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupAuthTestRouter injects a mock user context (simulating a logged-in user)
func setupAuthTestRouter(username string, role string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("username", username)
		c.Set("role", role)
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	// We pass nil for config, client, and redis since these specific endpoints don't use them
	ctrl := NewAuthController(testStore, nil, nil, nil, sseBroker)

	r.GET("/auth/me", ctrl.AuthMe)
	r.POST("/change-password", ctrl.ChangePassword)
	r.POST("/admin/users/:id/reset-security", ctrl.ResetUserSecurity)

	return r
}

func TestAuthController_Security(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	// Generate a real hash for the test password "oldpass123"
	hashedPassword, _ := auth.HashPassword("oldpass123")

	// Insert a target user (ID: 2)
	rawDB.Exec("INSERT INTO users (id, username, password_hash, role, mfa_enabled) VALUES (2, 'TestUser', ?, 'User', FALSE)", hashedPassword)

	t.Run("AuthMe - Fetch Own Profile", func(t *testing.T) {
		// Router acting as 'TestUser'
		router := setupAuthTestRouter("TestUser", "User")

		req, _ := http.NewRequest("GET", "/auth/me", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "TestUser", response["username"])
		assert.Equal(t, "User", response["role"])
		assert.Equal(t, false, response["mfa_enabled"])
	})

	t.Run("ChangePassword - Success", func(t *testing.T) {
		// Router acting as 'TestUser'
		router := setupAuthTestRouter("TestUser", "User")

		payload := map[string]string{
			"oldPassword": "oldpass123",
			"newPassword": "newsecurepass999",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/change-password", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Password updated successfully")

		// Verify the hash actually changed in the database
		var newHash string
		err := rawDB.QueryRow("SELECT password_hash FROM users WHERE username = 'TestUser'").Scan(&newHash)
		require.NoError(t, err)

		// Ensure the new password matches the new hash
		isValid := auth.CheckPassword("newsecurepass999", newHash)
		assert.True(t, isValid, "The new password should correctly validate against the new database hash")
	})

	t.Run("ChangePassword - Incorrect Old Password", func(t *testing.T) {
		router := setupAuthTestRouter("TestUser", "User")

		payload := map[string]string{
			"oldPassword": "wrongpassword",
			"newPassword": "doesntmatter",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/change-password", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "Incorrect old password")
	})

	t.Run("ResetUserSecurity - Admin Action", func(t *testing.T) {
		// Router acting as 'MasterAdmin'
		router := setupAuthTestRouter("MasterAdmin", "admin")

		payload := map[string]string{
			"new_password": "emergencyreset123",
		}
		body, _ := json.Marshal(payload)

		// Reset User ID 2
		req, _ := http.NewRequest("POST", "/admin/users/2/reset-security", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Security reset successfully")

		// Verify in DB
		var hash string
		err := rawDB.QueryRow("SELECT password_hash FROM users WHERE id = 2").Scan(&hash)
		require.NoError(t, err)

		isValid := auth.CheckPassword("emergencyreset123", hash)
		assert.True(t, isValid, "The admin reset should have applied the new emergency password hash")
	})

	t.Run("ResetUserSecurity - Block Master Admin Reset", func(t *testing.T) {
		router := setupAuthTestRouter("MasterAdmin", "admin")

		payload := map[string]string{
			"new_password": "hack",
		}
		body, _ := json.Marshal(payload)

		// Attempt to reset User ID 1 (Master Admin)
		req, _ := http.NewRequest("POST", "/admin/users/1/reset-security", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "master admin account cannot be reset")
	})
}
