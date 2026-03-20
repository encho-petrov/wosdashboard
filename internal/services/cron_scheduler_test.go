package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestGetRotationState(t *testing.T) {
	// We use time.Now() to dynamically calculate the anchor date backwards.
	// This ensures the test passes regardless of what year/day you run it!
	now := time.Now()

	t.Run("Day 0: Season 1, Week 1", func(t *testing.T) {
		// Anchor is today
		anchor := now.Format("2006-01-02")
		season, week := GetRotationState(anchor, 1)

		assert.Equal(t, 1, season)
		assert.Equal(t, 1, week)
	})

	t.Run("Day 7: Season 1, Week 2", func(t *testing.T) {
		// Anchor was 7 days ago
		anchor := now.AddDate(0, 0, -7).Format("2006-01-02")
		season, week := GetRotationState(anchor, 1)

		assert.Equal(t, 1, season)
		assert.Equal(t, 2, week)
	})

	t.Run("Day 55: Season 1, Week 8 (Last day of season)", func(t *testing.T) {
		// Anchor was 55 days ago
		anchor := now.AddDate(0, 0, -55).Format("2006-01-02")
		season, week := GetRotationState(anchor, 1)

		assert.Equal(t, 1, season)
		assert.Equal(t, 8, week)
	})

	t.Run("Day 56: Season 2, Week 1 (New Season Rollover)", func(t *testing.T) {
		// Anchor was exactly 56 days ago (8 weeks * 7 days)
		anchor := now.AddDate(0, 0, -56).Format("2006-01-02")
		season, week := GetRotationState(anchor, 1)

		assert.Equal(t, 2, season)
		assert.Equal(t, 1, week)
	})

	t.Run("Day 112: Season 3, Week 1", func(t *testing.T) {
		// Anchor was 112 days ago (16 weeks)
		anchor := now.AddDate(0, 0, -112).Format("2006-01-02")
		season, week := GetRotationState(anchor, 1)

		assert.Equal(t, 3, season)
		assert.Equal(t, 1, week)
	})
}
