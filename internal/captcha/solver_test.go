package captcha

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSolver_Solve(t *testing.T) {
	t.Run("Successful Solve Flow", func(t *testing.T) {
		pollCount := 0

		// Mock 2Captcha API Server
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")

			if r.URL.Path == "/in.php" {
				// 1. Acknowledge the image submission and return a Job ID
				w.Write([]byte(`{"status": 1, "request": "JOB_12345"}`))
				return
			}

			if r.URL.Path == "/res.php" {
				// Verify it's asking for the right Job ID
				assert.Equal(t, "JOB_12345", r.URL.Query().Get("id"))

				// 2. Simulate it not being ready on the first poll
				if pollCount == 0 {
					pollCount++
					w.Write([]byte(`{"status": 0, "request": "CAPCHA_NOT_READY"}`))
					return
				}

				// 3. Return the solved captcha on the second poll
				w.Write([]byte(`{"status": 1, "request": "SOLVED_TEXT_999"}`))
				return
			}
		}))
		defer server.Close()

		// Initialize solver and override settings for testing
		solver := NewSolver("test-api-key")
		solver.BaseURL = server.URL
		solver.InitialWait = 1 * time.Millisecond // Lightning fast tests!
		solver.PollDelay = 1 * time.Millisecond

		// Execute
		result, err := solver.Solve("data:image/png;base64,fake_image_data")

		// Assertions
		require.NoError(t, err)
		assert.Equal(t, "SOLVED_TEXT_999", result)
	})

	t.Run("Submission Rejection (Bad API Key)", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{"status": 0, "request": "ERROR_KEY_DOES_NOT_EXIST"}`))
		}))
		defer server.Close()

		solver := NewSolver("bad-key")
		solver.BaseURL = server.URL

		result, err := solver.Solve("fake_image")

		assert.Error(t, err)
		assert.Empty(t, result)
		assert.Contains(t, err.Error(), "ERROR_KEY_DOES_NOT_EXIST")
	})

	t.Run("Unsolvable Captcha Error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/in.php" {
				w.Write([]byte(`{"status": 1, "request": "JOB_BAD"}`))
			} else if r.URL.Path == "/res.php" {
				// 2Captcha returns status 0 and an error code if the worker marks it unsolvable
				w.Write([]byte(`{"status": 0, "request": "ERROR_CAPTCHA_UNSOLVABLE"}`))
			}
		}))
		defer server.Close()

		solver := NewSolver("test-key")
		solver.BaseURL = server.URL
		solver.InitialWait = 1 * time.Millisecond
		solver.PollDelay = 1 * time.Millisecond

		result, err := solver.Solve("fake_image")

		assert.Error(t, err)
		assert.Empty(t, result)
		assert.Contains(t, err.Error(), "ERROR_CAPTCHA_UNSOLVABLE")
	})
}
