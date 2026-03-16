package db

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper to easily create int pointers for Alliance IDs
func intPtr(i int) *int {
	return &i
}

func TestCronSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// 1. Pure Logic Tests (No DB needed for these, but good to keep together)
	t.Run("CalculateNextRun - INTERVAL", func(t *testing.T) {
		baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
		cron := DiscordCustomCron{
			RecurrenceType:   "INTERVAL",
			RecurrenceConfig: `{"hours": 24}`,
			NextRunTime:      baseTime,
		}

		next := cron.CalculateNextRun()
		assert.Equal(t, baseTime.Add(24*time.Hour), next, "Expected +24 hours")
	})

	t.Run("CalculateNextRun - WEEKLY", func(t *testing.T) {
		// Base time: A Monday (Weekday 1)
		baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

		cron := DiscordCustomCron{
			RecurrenceType:   "WEEKLY",
			RecurrenceConfig: `{"days": [3, 5], "weeks": 1}`, // Wed, Fri
			NextRunTime:      baseTime,
		}

		// Next run should jump to Wednesday (Weekday 3, which is +2 days)
		next := cron.CalculateNextRun()
		assert.Equal(t, baseTime.AddDate(0, 0, 2), next, "Expected to jump to Wednesday")
	})

	// 2. Database Integration Tests
	t.Run("Cron CRUD Operations", func(t *testing.T) {
		allianceID := 10

		// Create
		newCron := &DiscordCustomCron{
			AllianceID:       intPtr(allianceID),
			Name:             "Alliance Fort Reminder",
			ChannelID:        "123456789",
			NextRunTime:      time.Now().Add(1 * time.Hour).Round(time.Second), // Round strips microseconds for clean DB comparison
			RecurrenceType:   "INTERVAL",
			RecurrenceConfig: `{"hours": 24}`,
			Message:          "Fort starts in 1 hour!",
			IsActive:         true,
		}

		err := store.CreateCustomCron(newCron)
		require.NoError(t, err)
		assert.NotZero(t, newCron.ID, "Expected DB to assign an ID")

		// Read
		crons, err := store.GetCustomCrons(intPtr(allianceID))
		require.NoError(t, err)
		require.Len(t, crons, 1)
		assert.Equal(t, "Alliance Fort Reminder", crons[0].Name)

		// Ensure global crons don't fetch alliance crons
		globalCrons, err := store.GetCustomCrons(nil)
		require.NoError(t, err)
		assert.Len(t, globalCrons, 0)

		// Update
		newCron.Message = "Updated message!"
		err = store.UpdateCustomCron(newCron)
		require.NoError(t, err)

		updatedCrons, _ := store.GetCustomCrons(intPtr(allianceID))
		assert.Equal(t, "Updated message!", updatedCrons[0].Message)

		// Delete
		err = store.DeleteCustomCron(newCron.ID, intPtr(allianceID))
		require.NoError(t, err)

		cronsAfterDelete, _ := store.GetCustomCrons(intPtr(allianceID))
		assert.Len(t, cronsAfterDelete, 0)
	})

	t.Run("Cron Queue Fetching & Status Toggles", func(t *testing.T) {
		now := time.Now().Round(time.Second)

		// Seed 3 Crons: Added recurrence_config = '{}' to prevent NULL scan errors
		store.db.Exec(`INSERT INTO discord_custom_crons (name, channel_id, next_run_time, recurrence_type, recurrence_config, message, is_active) VALUES 
            ('Past Due Active', '111', ?, 'INTERVAL', '{}', 'Run Me', TRUE),
            ('Future Active', '222', ?, 'INTERVAL', '{}', 'Wait', TRUE),
            ('Past Due Inactive', '333', ?, 'INTERVAL', '{}', 'Ignore Me', FALSE)
        `, now.Add(-1*time.Hour), now.Add(1*time.Hour), now.Add(-1*time.Hour))

		// Test GetPendingCustomCrons
		pending, err := store.GetPendingCustomCrons(now)
		require.NoError(t, err)
		require.Len(t, pending, 1, "Should only pick up the past due, active cron")
		assert.Equal(t, "Past Due Active", pending[0].Name)

		// Test GetAllActiveCustomCrons
		active, err := store.GetAllActiveCustomCrons()
		require.NoError(t, err)
		require.Len(t, active, 2, "Should pick up all active crons regardless of time")

		// Test UpdateNextRun
		targetID := pending[0].ID
		nextWeek := now.Add(7 * 24 * time.Hour)
		err = store.UpdateCustomCronNextRun(targetID, nextWeek)
		require.NoError(t, err)

		// Ensure it's no longer pending
		pendingAfter, _ := store.GetPendingCustomCrons(now)
		assert.Len(t, pendingAfter, 0)

		// Test Toggles (Global toggle test)
		err = store.ToggleCustomCron(targetID, nil)
		require.NoError(t, err)

		var isActive bool
		store.db.Get(&isActive, "SELECT is_active FROM discord_custom_crons WHERE id = ?", targetID)
		assert.False(t, isActive, "Expected cron to be toggled off")

		// Test specific status update
		err = store.UpdateCustomCronStatus(targetID, true)
		require.NoError(t, err)
		store.db.Get(&isActive, "SELECT is_active FROM discord_custom_crons WHERE id = ?", targetID)
		assert.True(t, isActive, "Expected cron to be forced active")
	})
}
