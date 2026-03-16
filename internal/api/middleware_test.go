package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gift-redeemer/internal/auth"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupMiddlewareTestRouter() *gin.Engine {
	r := gin.Default()

	// Endpoint protected by Auth only
	r.GET("/protected", AuthMiddleware(testStore), func(c *gin.Context) {
		userId, _ := c.Get("userId")
		role, _ := c.Get("role")
		allianceId, _ := c.Get("allianceId")
		username, _ := c.Get("username")

		c.JSON(http.StatusOK, gin.H{
			"userId":     userId,
			"role":       role,
			"allianceId": allianceId,
			"username":   username,
		})
	})

	// Endpoint protected by Auth AND AdminOnly
	r.GET("/admin-only", AuthMiddleware(testStore), AdminOnlyMiddleware(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Welcome Admin"})
	})

	return r
}

func TestMiddleware(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (10, 'Guardians')")

	// Seed an Admin User
	rawDB.Exec("INSERT INTO users (id, username, role, alliance_id) VALUES (90, 'AdminUser', 'admin', 10)")
	adminToken, err := auth.GenerateToken("AdminUser", "admin")
	require.NoError(t, err, "Failed to generate admin token")

	// Seed a Standard User
	rawDB.Exec("INSERT INTO users (id, username, role, alliance_id) VALUES (91, 'StandardUser', 'user', 10)")
	userToken, err := auth.GenerateToken("StandardUser", "user")
	require.NoError(t, err, "Failed to generate user token")

	router := setupMiddlewareTestRouter()

	t.Run("Auth - Missing Header Blocked", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/protected", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "Authorization header required")
	})

	t.Run("Auth - Invalid Format Blocked", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Basic some-base64-string")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "Invalid authorization format")
	})

	t.Run("Auth - Fake/Invalid Token Blocked", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer fake.jwt.token123")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "Invalid or expired token")
	})

	t.Run("Auth - Valid User Success (Context Injection)", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+userToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)

		// Verify the middleware successfully fetched the user from DB and injected the context
		assert.Equal(t, float64(91), resp["userId"])
		assert.Equal(t, "user", resp["role"])
		assert.Equal(t, float64(10), resp["allianceId"])
		assert.Equal(t, "StandardUser", resp["username"])
	})

	t.Run("Admin - Standard User Blocked", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/admin-only", nil)
		req.Header.Set("Authorization", "Bearer "+userToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "Admin access required")
	})

	t.Run("Admin - Admin User Success", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/admin-only", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Welcome Admin")
	})
}
