package services

import (
	"bytes"
	"encoding/json"
	"gift-redeemer/internal/db"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFormatDiscordPing(t *testing.T) {
	t.Run("Handle Nil and Empty", func(t *testing.T) {
		assert.Equal(t, "", FormatDiscordPing(nil))

		empty := ""
		assert.Equal(t, "", FormatDiscordPing(&empty))
	})

	t.Run("Handle Special Mentions", func(t *testing.T) {
		everyone := "everyone"
		assert.Equal(t, "@everyone", FormatDiscordPing(&everyone))

		here := "@here" // Testing with the @ prefix already attached
		assert.Equal(t, "@here", FormatDiscordPing(&here))
	})

	t.Run("Handle Standard Role ID", func(t *testing.T) {
		roleID := "123456789"
		assert.Equal(t, "<@&123456789>", FormatDiscordPing(&roleID))
	})
}

func TestSendCustomDiscordEmbed(t *testing.T) {
	t.Run("Successful Transmission", func(t *testing.T) {
		// Mock Discord API
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "POST", r.Method)
			assert.Equal(t, "Bot test-token", r.Header.Get("Authorization"))
			assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

			// Read and verify the payload body
			bodyBytes, _ := io.ReadAll(r.Body)
			var payload map[string]interface{}
			json.Unmarshal(bodyBytes, &payload)

			assert.Equal(t, "Ping!", payload["content"])
			embeds := payload["embeds"].([]interface{})
			embed := embeds[0].(map[string]interface{})

			assert.Equal(t, "Test Title", embed["title"])
			assert.Equal(t, float64(3447003), embed["color"]) // JSON numbers decode to float64

			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		// Override the base URL
		DiscordAPIBase = server.URL

		err := SendCustomDiscordEmbed("test-token", "channel-123", "Test Title", "Test Desc", 3447003, "Ping!")
		assert.NoError(t, err)
	})

	t.Run("Handle API Errors", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden) // Mocking a 403 Missing Permissions
		}))
		defer server.Close()
		DiscordAPIBase = server.URL

		err := SendCustomDiscordEmbed("bad-token", "channel-123", "T", "D", 0, "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "discord API error: 403")
	})
}

func TestMessageBuilders(t *testing.T) {
	// We will use a mock server that just returns 200 OK so we can test the wrapper functions
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	DiscordAPIBase = server.URL

	t.Run("SendDiscordRotation", func(t *testing.T) {
		entries := []db.RotationEntryExtended{
			{BuildingType: "Stronghold", InternalID: 1, AllianceName: "Alpha"},
			{BuildingType: "Fortress", InternalID: 2, AllianceName: ""}, // Testing fallback
		}

		err := SendDiscordRotation("token", "123", 5, 2, entries, "Alert!")
		assert.NoError(t, err)
	})

	t.Run("SendMinistryPing", func(t *testing.T) {
		err := SendMinistryPing("token", "123", "Development", "IceKing", "WOS", "<@&999>")
		assert.NoError(t, err)
	})
}

func TestSendDiscordImage(t *testing.T) {
	t.Run("Successful Multipart Transmission", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "POST", r.Method)
			assert.Contains(t, r.Header.Get("Content-Type"), "multipart/form-data")

			// Parse the multipart form to ensure data arrived safely
			err := r.ParseMultipartForm(10 << 20)
			require.NoError(t, err)

			assert.Equal(t, `{"allowed_mentions":{"parse":["everyone","roles","users"]},"content":"Here is the map!"}`, r.FormValue("payload_json"))

			file, header, err := r.FormFile("file")
			require.NoError(t, err)
			defer file.Close()

			assert.Equal(t, "map.png", header.Filename)

			fileBytes, _ := io.ReadAll(file)
			assert.Equal(t, []byte("fake-image-bytes"), fileBytes)

			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		DiscordAPIBase = server.URL

		buf := bytes.NewBuffer([]byte("fake-image-bytes"))
		err := SendDiscordImage("token", "123", buf, "map.png", "Here is the map!")

		assert.NoError(t, err)
	})
}
