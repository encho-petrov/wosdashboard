package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGiftCodeSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	t.Run("Mark As Redeemed (Player Creation & Tracking)", func(t *testing.T) {
		fid := int64(999888777)
		code := "FREEBIE2026"

		// 1. Mark as redeemed for a totally new player
		err := store.MarkAsRedeemed(fid, code)
		require.NoError(t, err)

		// 2. Verify the player was implicitly created by the INSERT IGNORE
		var count int
		err = store.db.Get(&count, "SELECT COUNT(*) FROM players WHERE player_id = ?", fid)
		require.NoError(t, err)
		assert.Equal(t, 1, count, "Player should have been created")

		// 3. Verify the code was logged
		var loggedCode string
		err = store.db.Get(&loggedCode, "SELECT gift_code FROM player_gift_codes WHERE player_id = ?", fid)
		require.NoError(t, err)
		assert.Equal(t, code, loggedCode)

		// 4. Test duplicate redemption tracking
		err = store.MarkAsRedeemed(fid, code)
		require.Error(t, err, "Should error on duplicate code redemption for the same player")
	})

	t.Run("Gift Code Job Lifecycle", func(t *testing.T) {
		adminID := int64(1)

		// 1. Create Job
		jobID, err := store.CreateJob(adminID, "CODE1,CODE2", "Pending", 100)
		require.NoError(t, err)
		assert.Contains(t, jobID, "job_")

		// 2. Fetch Job (Verify NULL mappings)
		jobs, err := store.GetRecentJobs()
		require.NoError(t, err)
		require.Len(t, jobs, 1)

		assert.Equal(t, jobID, jobs[0].JobID)
		assert.Equal(t, adminID, jobs[0].InitiatedBy)
		assert.Equal(t, "Pending", jobs[0].Status)
		assert.Equal(t, 100, jobs[0].TotalPlayers)
		assert.Equal(t, 0, jobs[0].ProcessedPlayers)
		assert.Nil(t, jobs[0].CompletedAt, "CompletedAt should map to a nil pointer")
		assert.Nil(t, jobs[0].ReportPath, "ReportPath should map to a nil pointer")

		// 3. Update Progress
		err = store.UpdateJobProgress(jobID, 45)
		require.NoError(t, err)

		// 4. Complete Job
		reportFile := "/reports/job123.csv"
		err = store.CompleteJob(jobID, "Completed", reportFile)
		require.NoError(t, err)

		// 5. Fetch Completed Job (Verify populated mappings)
		completedJobs, _ := store.GetRecentJobs()
		require.Len(t, completedJobs, 1)
		assert.Equal(t, 45, completedJobs[0].ProcessedPlayers)
		assert.Equal(t, "Completed", completedJobs[0].Status)
		require.NotNil(t, completedJobs[0].CompletedAt)
		require.NotNil(t, completedJobs[0].ReportPath)
		assert.Equal(t, reportFile, *completedJobs[0].ReportPath)
	})
}
