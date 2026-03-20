package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMinistrySuite(t *testing.T) {
	resetDB(t)
	store := testStore

	// --- Seed Data ---
	store.db.Exec("INSERT INTO alliances (id, name) VALUES (50, 'Ministry Elite')")
	store.db.Exec("INSERT INTO players (player_id, nickname, alliance_id) VALUES (1001, 'MinisterBob', 50)")

	t.Run("Create & Fetch Ministry Event", func(t *testing.T) {
		// 1. Create Event with 2 days
		days := []MinistryDay{
			{BuffName: "Construction", ActiveDate: "2026-03-20"},
			{BuffName: "Training", ActiveDate: "2026-03-21"},
		}
		err := store.CreateMinistryEvent("Spring Ministry", true, days)
		require.NoError(t, err)

		// 2. Verify Active Event
		activeEvent, err := store.GetActiveMinistryEvent()
		require.NoError(t, err)
		require.NotNil(t, activeEvent)
		assert.Equal(t, "Spring Ministry", activeEvent.Title)
		assert.Equal(t, "Planning", activeEvent.Status)
		assert.True(t, activeEvent.AnnounceEnabled)

		// 3. Verify Days
		dbDays, err := store.GetMinistryDays(activeEvent.ID)
		require.NoError(t, err)
		require.Len(t, dbDays, 2)
		assert.Equal(t, "Construction", dbDays[0].BuffName)

		// 4. Verify 48 Slots were created per day
		slots, err := store.GetMinistrySlots(dbDays[0].ID)
		require.NoError(t, err)
		require.Len(t, slots, 48, "Expected exactly 48 slots to be generated")
		assert.Equal(t, 0, slots[0].SlotIndex)
		assert.Equal(t, 47, slots[47].SlotIndex)
	})

	t.Run("Slot Assignments & Player Fetches", func(t *testing.T) {
		activeEvent, _ := store.GetActiveMinistryEvent()
		days, _ := store.GetMinistryDays(activeEvent.ID)
		day1 := days[0].ID

		slots, _ := store.GetMinistrySlots(day1)
		targetSlot := slots[5] // Grab the 6th slot (index 5)

		playerFID := int64(1001)

		// 1. Assign Player to Slot
		err := store.UpdateMinistrySlot(targetSlot.ID, &playerFID)
		require.NoError(t, err)

		// 2. Fetch specific slot and verify JOINs
		assignedSlot, err := store.GetMinistrySlotByIndex(day1, 5)
		require.NoError(t, err)
		require.NotNil(t, assignedSlot)
		require.NotNil(t, assignedSlot.Nickname)
		assert.Equal(t, "MinisterBob", *assignedSlot.Nickname)
		assert.Equal(t, "Ministry Elite", *assignedSlot.AllianceName)

		// 3. Fetch Player's overall slots
		playerSlots, err := store.GetPlayerMinistrySlots(playerFID)
		require.NoError(t, err)
		require.Len(t, playerSlots, 1)
		assert.Equal(t, "Construction", playerSlots[0].BuffName)
		assert.Equal(t, 5, playerSlots[0].SlotIndex)
	})

	t.Run("Status Lifecycle & Toggles", func(t *testing.T) {
		activeEvent, _ := store.GetActiveMinistryEvent()
		eventID := activeEvent.ID

		// 1. Toggle Announce
		err := store.UpdateMinistryAnnounce(eventID, false)
		require.NoError(t, err)

		// 2. Update Status to Active
		err = store.UpdateMinistryStatus(eventID, "Active")
		require.NoError(t, err)

		// Verify still considered "Active" by the fetcher
		activeAgain, _ := store.GetActiveMinistryEvent()
		assert.Equal(t, "Active", activeAgain.Status)
		assert.False(t, activeAgain.AnnounceEnabled)

		// 3. Close the Event
		err = store.UpdateMinistryStatus(eventID, "Closed")
		require.NoError(t, err)

		// 4. Verify Active fetcher now returns nil
		closedActive, _ := store.GetActiveMinistryEvent()
		assert.Nil(t, closedActive, "Should be no active events")

		// 5. Verify it appears in Closed history
		history, err := store.GetClosedMinistryEvents()
		require.NoError(t, err)
		require.Len(t, history, 1)
		assert.Equal(t, "Spring Ministry", history[0].Title)
		assert.NotNil(t, history[0].ClosedAt)
	})
}
