package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCronManager_Lifecycle(t *testing.T) {
	// We pass nil for the DB store because we are only testing the
	// Start/Stop goroutine lifecycle, not the actual job processing.
	cm := NewCronManager(nil, "fake-bot-token")

	t.Run("Start and Stop gracefully", func(t *testing.T) {
		cm.Start()

		// Give the goroutine a tiny fraction of a second to initialize
		time.Sleep(10 * time.Millisecond)

		// Assert the channel is open (not nil)
		assert.NotNil(t, cm.stopChan)

		// Stop the manager
		cm.Stop()

		// If Stop() didn't work correctly or blocked forever,
		// this test would hang and timeout.
	})

	t.Run("Stop is Idempotent (Safe to call twice)", func(t *testing.T) {
		// Because you used sync.Once, calling Stop() a second time
		// should do nothing instead of panicking from "close of closed channel"

		assert.NotPanics(t, func() {
			cm.Stop()
			cm.Stop()
			cm.Stop()
		}, "Calling Stop multiple times should be caught by sync.Once")
	})
}
