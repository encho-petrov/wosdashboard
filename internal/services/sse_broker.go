package services

import (
	"log"
)

type Client chan string

type SSEBroker struct {
	Notifier       chan string
	newClients     chan Client
	closingClients chan Client
	clients        map[Client]bool
}

func NewSSEBroker() *SSEBroker {
	broker := &SSEBroker{
		Notifier:       make(chan string, 1),
		newClients:     make(chan Client),
		closingClients: make(chan Client),
		clients:        make(map[Client]bool),
	}
	go broker.listen()
	return broker
}

func (broker *SSEBroker) listen() {
	for {
		select {
		case s := <-broker.newClients:
			broker.clients[s] = true
			log.Printf("SSE Client added. Total: %d", len(broker.clients))
		case s := <-broker.closingClients:
			delete(broker.clients, s)
			log.Printf("SSE Client removed. Total: %d", len(broker.clients))
		case event := <-broker.Notifier:
			for clientMessageChan := range broker.clients {
				select {
				case clientMessageChan <- event:
				default:
					delete(broker.clients, clientMessageChan)
				}
			}
		}
	}
}

func (broker *SSEBroker) AddClient(client Client) {
	broker.newClients <- client
}

func (broker *SSEBroker) RemoveClient(client Client) {
	broker.closingClients <- client
}
