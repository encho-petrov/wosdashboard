package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestSSEBroker(t *testing.T) {
	// Initialize the broker (starts the listen goroutine automatically)
	broker := NewSSEBroker()

	t.Run("Add Client and Receive Event", func(t *testing.T) {
		// Create a buffered channel so it can easily receive the message
		clientChan := make(Client, 1)

		broker.AddClient(clientChan)
		time.Sleep(10 * time.Millisecond) // Yield to allow listen() to process the addition

		// Broadcast an event
		broker.Notifier <- "REFRESH_WARROOM"

		// Verify the client received it
		select {
		case msg := <-clientChan:
			assert.Equal(t, "REFRESH_WARROOM", msg)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Client did not receive the broadcasted event in time")
		}
	})

	t.Run("Remove Client", func(t *testing.T) {
		clientChan := make(Client, 1)

		broker.AddClient(clientChan)
		time.Sleep(10 * time.Millisecond)

		broker.RemoveClient(clientChan)
		time.Sleep(10 * time.Millisecond) // Yield to allow listen() to process the removal

		broker.Notifier <- "REFRESH_SQUADS"

		// Verify the client did NOT receive it
		select {
		case msg := <-clientChan:
			t.Fatalf("Removed client unexpectedly received an event: %s", msg)
		case <-time.After(50 * time.Millisecond):
			// Success! The channel is empty, meaning they were successfully removed.
		}
	})

	t.Run("Auto-Remove Blocked Client", func(t *testing.T) {
		// Create an UNBUFFERED channel. If we aren't actively reading from it,
		// the broker will be unable to send to it, triggering the 'default' drop logic.
		blockedClient := make(Client)

		// Create a good, buffered client to ensure the broker didn't crash
		goodClient := make(Client, 1)

		broker.AddClient(blockedClient)
		broker.AddClient(goodClient)
		time.Sleep(10 * time.Millisecond)

		// Broadcast. The broker will attempt to send to blockedClient, fail instantly,
		// delete it from the map, and then successfully send to goodClient.
		broker.Notifier <- "AUTO_REMOVE_TEST"

		// Verify the good client still got the message
		select {
		case msg := <-goodClient:
			assert.Equal(t, "AUTO_REMOVE_TEST", msg)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Good client did not receive event; the broker got stuck!")
		}
	})
}
