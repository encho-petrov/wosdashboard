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

func CheckMinistrySchedule(store *db.Store, webhookURL string) {
	event, err := store.GetActiveMinistryEvent()
	if err != nil || event == nil || event.Status != "Active" || !event.AnnounceEnabled {
		return
	}

	now := time.Now().UTC()
	if now.Hour() == 23 && now.Minute() == 45 {
		tomorrow := now.Add(24 * time.Hour).Format("2006-01-02")
		day, _ := store.GetMinistryDayByDate(event.ID, tomorrow)

		if day != nil {
			slots, _ := store.GetMinistrySlots(day.ID)

			desc := fmt.Sprintf("Here is the schedule for tomorrow's **%s** buff.\n\n", day.BuffName)
			for _, s := range slots {
				timeLabel := fmt.Sprintf("%02d:%02d UTC", s.SlotIndex/2, (s.SlotIndex%2)*30)
				if s.PlayerFID != nil {
					desc += fmt.Sprintf("`%s` - **%s** [%s]\n", timeLabel, *s.Nickname, *s.AllianceName)
				} else {
					desc += fmt.Sprintf("`%s` - *[ Open Slot ]*\n", timeLabel)
				}
			}

			_ = SendCustomDiscordEmbed(webhookURL, "📅 Daily Ministry Manifest", desc, 3447003)
		}
	}

	targetTime := now.Add(5 * time.Minute)

	if targetTime.Minute() == 0 || targetTime.Minute() == 30 {
		today := targetTime.Format("2006-01-02")
		day, _ := store.GetMinistryDayByDate(event.ID, today)

		if day != nil {
			slotIndex := targetTime.Hour() * 2
			if targetTime.Minute() == 30 {
				slotIndex += 1
			}

			slot, _ := store.GetMinistrySlotByIndex(day.ID, slotIndex)

			if slot != nil && slot.PlayerFID != nil {
				title := fmt.Sprintf("🛠️ Ministry Buff Alert: %s", day.BuffName)
				desc := fmt.Sprintf("Get ready! **%s** from [%s], your turn for the %s buff starts in exactly 5 minutes.",
					*slot.Nickname, *slot.AllianceName, day.BuffName)

				_ = SendCustomDiscordEmbed(webhookURL, title, desc, 15158332)
			}
		}
	}
}
