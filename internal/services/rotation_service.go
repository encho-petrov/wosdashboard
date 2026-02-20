package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/db"
	"net/http"
	"time"
)

func CalculateUpcomingWeek(referenceDateStr string) (int, int) {
	referenceDate, _ := time.Parse("2006-01-02", referenceDateStr)
	daysSince := int(time.Since(referenceDate).Hours() / 24)

	seasonNumber := (daysSince / 56) + 1
	currentWeek := ((daysSince / 7) % 8) + 1

	upcomingWeek := currentWeek + 1
	targetSeason := seasonNumber

	if upcomingWeek > 8 {
		upcomingWeek = 1
		targetSeason++
	}

	return targetSeason, upcomingWeek
}

type DiscordEmbed struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       int    `json:"color"`
}

type DiscordPayload struct {
	Content string         `json:"content"`
	Embeds  []DiscordEmbed `json:"embeds"`
}

func SendDiscordRotation(webhookURL string, week int, entries []db.RotationEntryExtended) error {
	if webhookURL == "" {
		return fmt.Errorf("discord webhook URL is empty")
	}

	description := ""
	for _, entry := range entries {
		alliance := entry.AllianceName
		if alliance == "" {
			alliance = "*Unassigned*"
		}
		description += fmt.Sprintf("🛡️ **%s %d** ➡️ %s\n", entry.BuildingType, entry.InternalID, alliance)
	}

	payload := DiscordPayload{
		Content: "Everyone Here is the upcoming Fortress Rotation!",
		Embeds: []DiscordEmbed{
			{
				Title:       fmt.Sprintf("🗺️ State Rotation: Week %d", week),
				Description: description,
				Color:       3447003,
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
