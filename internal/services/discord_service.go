package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func SendCustomDiscordEmbed(webhookURL, title, description string, color int) error {
	if webhookURL == "" {
		return fmt.Errorf("discord webhook URL is empty")
	}

	payload := DiscordPayload{
		Embeds: []DiscordEmbed{
			{
				Title:       title,
				Description: description,
				Color:       color,
			},
		},
	}

	jsonPayload, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord API returned status: %d", resp.StatusCode)
	}

	return nil
}
