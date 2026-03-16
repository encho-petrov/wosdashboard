package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"gift-redeemer/internal/config"
	"gift-redeemer/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupDiscordTestRouter(username string, role string) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Set("username", username)
		c.Set("role", role)
		c.Next()
	})

	sseBroker := services.NewSSEBroker()
	// We pass nil for CronManager and RedisStore as these specific DB endpoints don't use them
	ctrl := NewDiscordController(testStore, &config.Config{}, nil, nil, sseBroker)

	r.GET("/discord/routes", ctrl.GetRoutes)
	r.DELETE("/discord/routes/:eventType", ctrl.DeleteRoute)

	r.GET("/discord/crons", ctrl.GetCustomCrons)
	r.POST("/discord/crons", ctrl.CreateCustomCron)
	r.PUT("/discord/crons/:id/toggle", ctrl.ToggleCustomCron)
	r.DELETE("/discord/crons/:id", ctrl.DeleteCustomCron)

	return r
}

func TestDiscordController_DatabaseEndpoints(t *testing.T) {
	resetDB(t)

	// --- Seed the DB ---
	// Create an Alliance and a User
	rawDB.Exec("INSERT INTO alliances (id, name) VALUES (50, 'Discord Alliance')")
	rawDB.Exec("INSERT INTO users (id, username, role, alliance_id) VALUES (5, 'DiscordAdmin', 'admin', 50)")

	// Seed a Discord Guild and Route mapping for that alliance
	rawDB.Exec("INSERT INTO discord_guilds (guild_id, alliance_id, guild_name) VALUES ('guild-123', 50, 'Test Server')")
	rawDB.Exec("INSERT INTO discord_routes (alliance_id, event_type, channel_id) VALUES (50, 'general_announcements', 'chan-999')")

	router := setupDiscordTestRouter("DiscordAdmin", "admin")

	t.Run("GetRoutes - Fetch Alliance Routes", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/discord/routes", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["isLinked"].(bool))
		assert.Equal(t, "Test Server", response["guildName"])

		routes := response["routes"].(map[string]interface{})
		require.NotNil(t, routes["general_announcements"])

		announcementRoute := routes["general_announcements"].(map[string]interface{})
		assert.Equal(t, "chan-999", announcementRoute["channelId"])
	})

	t.Run("DeleteRoute", func(t *testing.T) {
		req, _ := http.NewRequest("DELETE", "/discord/routes/general_announcements", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Route unlinked successfully")

		// Verify in DB
		var count int
		rawDB.QueryRow("SELECT COUNT(*) FROM discord_routes WHERE event_type = 'general_announcements'").Scan(&count)
		assert.Equal(t, 0, count)
	})

	t.Run("CreateCustomCron", func(t *testing.T) {
		payload := map[string]interface{}{
			"name":             "Test Alert",
			"nextRunTime":      time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			"recurrenceType":   "INTERVAL",
			"recurrenceConfig": `{"hours":24}`,
			"message":          "Hello Discord!",
			"channelId":        "chan-123",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/discord/crons", bytes.NewBuffer(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &response)
		assert.Equal(t, "Test Alert", response["name"])
		assert.Equal(t, "chan-123", response["channelId"])
	})

	t.Run("GetCustomCrons & Toggle", func(t *testing.T) {
		// 1. Fetch Crons
		req, _ := http.NewRequest("GET", "/discord/crons", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var crons []map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &crons)
		require.NoError(t, err)
		require.Len(t, crons, 1)

		cronID := int(crons[0]["id"].(float64))
		assert.True(t, crons[0]["isActive"].(bool))

		// 2. Toggle Status
		toggleReq, _ := http.NewRequest("PUT", "/discord/crons/"+strconv.Itoa(cronID)+"/toggle", nil)
		wToggle := httptest.NewRecorder()
		router.ServeHTTP(wToggle, toggleReq)

		assert.Equal(t, http.StatusOK, wToggle.Code)

		// Verify in DB
		var isActive bool
		rawDB.QueryRow("SELECT is_active FROM discord_custom_crons WHERE id = ?", cronID).Scan(&isActive)
		assert.False(t, isActive, "Cron should have been toggled off")
	})

	t.Run("DeleteCustomCron", func(t *testing.T) {
		// Grab the ID from the DB
		var cronID int
		rawDB.QueryRow("SELECT id FROM discord_custom_crons LIMIT 1").Scan(&cronID)

		req, _ := http.NewRequest("DELETE", "/discord/crons/"+strconv.Itoa(cronID), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "Alert deleted")

		var count int
		rawDB.QueryRow("SELECT COUNT(*) FROM discord_custom_crons").Scan(&count)
		assert.Equal(t, 0, count)
	})
}
