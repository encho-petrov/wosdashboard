package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"gift-redeemer/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupRedeemTestRouter() *gin.Engine {
	r := gin.Default()

	// Pass nil for processor and redis since we are only testing DB and FS routes here
	ctrl := NewRedeemController(testStore, &config.Config{}, nil, nil, nil)

	r.GET("/jobs", ctrl.GetRecentJobs)
	r.GET("/reports/:filename", ctrl.DownloadReport)

	return r
}

func TestRedeemController(t *testing.T) {
	resetDB(t)
	router := setupRedeemTestRouter()

	t.Run("GetRecentJobs", func(t *testing.T) {
		// Seed a job into the database (Added gift_codes and report_path to prevent NULL scan panics!)
		_, err := rawDB.Exec(`
            INSERT INTO jobs (job_id, initiated_by_user_id, gift_codes, status, total_players, processed_players, report_path) 
            VALUES ('job-123', 1, 'CODE1,CODE2', 'COMPLETED', 100, 100, 'report.csv')
        `)
		require.NoError(t, err, "Failed to seed jobs table")

		req, _ := http.NewRequest("GET", "/jobs", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var jobs []map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &jobs)
		require.NoError(t, err)

		require.Len(t, jobs, 1)
		assert.Equal(t, "job-123", jobs[0]["jobId"])
		assert.Equal(t, "COMPLETED", jobs[0]["status"])
	})

	t.Run("DownloadReport - Path Traversal Blocked", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/reports/malicious\\file.csv", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Expect 404 Not Found
		assert.Equal(t, http.StatusNotFound, w.Code)

		// Expect "Report not found"
		assert.Contains(t, w.Body.String(), "Report not found")
	})

	t.Run("DownloadReport - Invalid Extension Blocked", func(t *testing.T) {
		// An attacker tries to grab a sensitive system file without a .csv extension
		req, _ := http.NewRequest("GET", "/reports/passwd", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// This should hit filepath.Ext() != ".csv" check and return 400
		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Body.String(), "Invalid file request")
	})

	t.Run("DownloadReport - Success", func(t *testing.T) {
		// 1. Setup a temporary "reports" directory and a dummy CSV file
		err := os.MkdirAll("reports", 0755)
		require.NoError(t, err)
		defer os.RemoveAll("reports") // Clean up after the test

		dummyFilePath := filepath.Join("reports", "test_report.csv")
		err = os.WriteFile(dummyFilePath, []byte("fid,status\n12345,success"), 0644)
		require.NoError(t, err)

		// 2. Request the file
		req, _ := http.NewRequest("GET", "/reports/test_report.csv", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// 3. Assertions
		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "text/csv", w.Header().Get("Content-Type"))
		assert.Equal(t, "attachment; filename=test_report.csv", w.Header().Get("Content-Disposition"))
		assert.Equal(t, "fid,status\n12345,success", w.Body.String())
	})

	t.Run("DownloadReport - Not Found", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/reports/missing_file.csv", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assert.Contains(t, w.Body.String(), "Report not found")
	})
}
