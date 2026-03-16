package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDiscordSuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// We reuse this helper from cron_test.go
	// func intPtr(i int) *int { return &i }

	t.Run("Discord Guilds (Upsert & Fetch)", func(t *testing.T) {
		// 1. Insert State Guild
		err := store.UpsertDiscordGuild("state-guild-123", "State Server", nil)
		require.NoError(t, err)

		// 2. Insert Alliance Guild
		allianceID := 10
		err = store.UpsertDiscordGuild("alliance-guild-456", "Alliance Server", intPtr(allianceID))
		require.NoError(t, err)

		// 3. Update Existing Guild (Upsert Test)
		err = store.UpsertDiscordGuild("state-guild-123", "Renamed State Server", nil)
		require.NoError(t, err)

		// Verify Fetches
		stateGuild, err := store.GetGuildByAlliance(nil)
		require.NoError(t, err)
		assert.Equal(t, "Renamed State Server", stateGuild.GuildName)

		allianceGuild, err := store.GetGuildByAlliance(intPtr(allianceID))
		require.NoError(t, err)
		assert.Equal(t, "Alliance Server", allianceGuild.GuildName)
	})

	t.Run("Discord Routes & Targets", func(t *testing.T) {
		allianceID := 10
		pingRole := "123123123"

		// Create State Route
		err := store.UpsertDiscordRoute(nil, "global_war_room", "channel-state", &pingRole)
		require.NoError(t, err)

		// Create Alliance Route
		err = store.UpsertDiscordRoute(intPtr(allianceID), "general_announcements", "channel-alliance", nil)
		require.NoError(t, err)

		// Test GetRouteForEvent (State)
		stateRoute, err := store.GetRouteForEvent(nil, "global_war_room")
		require.NoError(t, err)
		require.NotNil(t, stateRoute)
		assert.Equal(t, "channel-state", stateRoute.ChannelID)
		assert.Equal(t, "123123123", *stateRoute.PingRoleID)

		// Test GetAllRoutesForAlliance
		allianceRoutes, err := store.GetAllRoutesForAlliance(intPtr(allianceID))
		require.NoError(t, err)
		assert.Len(t, allianceRoutes, 1)

		// Test GetBroadcastTargets (Combined Fetcher)
		targets := store.GetBroadcastTargets("global_war_room", "general_announcements")
		assert.Len(t, targets, 2, "Should fetch 1 state target and 1 alliance target")

		// Test Deletion
		err = store.DeleteDiscordRoute(intPtr(allianceID), "general_announcements")
		require.NoError(t, err)

		routesAfterDelete, _ := store.GetAllRoutesForAlliance(intPtr(allianceID))
		assert.Len(t, routesAfterDelete, 0)
	})

	t.Run("Discord Schedules", func(t *testing.T) {
		schedule := &DiscordSchedule{
			JobName:        "Test Job",
			CronExpression: "0 12 * * *",
			ChannelID:      "channel-1",
			MessagePayload: "Hello",
			IsActive:       true,
		}

		// Create
		err := store.CreateSchedule(schedule)
		require.NoError(t, err)
		assert.NotZero(t, schedule.ID)

		// Read Active
		active, err := store.GetActiveSchedules()
		require.NoError(t, err)
		require.Len(t, active, 1)

		// Toggle Status
		err = store.UpdateScheduleStatus(schedule.ID, false)
		require.NoError(t, err)

		activeAfterToggle, _ := store.GetActiveSchedules()
		assert.Len(t, activeAfterToggle, 0)

		// Delete
		err = store.DeleteSchedule(schedule.ID)
		require.NoError(t, err)
	})

	t.Run("Disconnect Discord Server Transaction", func(t *testing.T) {
		allianceID := 20

		// Seed some configs and routes for alliance 20
		store.db.Exec("INSERT INTO discord_configs (alliance_id, guild_id) VALUES (?, 'guild-999')", allianceID)
		store.db.Exec("INSERT INTO discord_routes (alliance_id, event_type) VALUES (?, 'test')", allianceID)
		store.db.Exec("INSERT INTO discord_custom_crons (alliance_id, name) VALUES (?, 'test')", allianceID)

		// Disconnect
		err := store.DisconnectDiscordServer(intPtr(allianceID))
		require.NoError(t, err)

		// Verify all 3 tables were wiped for this alliance
		var count int
		store.db.Get(&count, "SELECT COUNT(*) FROM discord_configs WHERE alliance_id = ?", allianceID)
		assert.Equal(t, 0, count)

		store.db.Get(&count, "SELECT COUNT(*) FROM discord_routes WHERE alliance_id = ?", allianceID)
		assert.Equal(t, 0, count)

		store.db.Get(&count, "SELECT COUNT(*) FROM discord_custom_crons WHERE alliance_id = ?", allianceID)
		assert.Equal(t, 0, count)
	})
}
