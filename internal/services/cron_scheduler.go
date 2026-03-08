package services

import (
	"gift-redeemer/internal/db"
	"log"
	"time"
)

func GetRotationState(anchorDateStr string, anchorSeason int) (int, int) {
	referenceDate, _ := time.Parse("2006-01-02", anchorDateStr)
	daysSince := int(time.Since(referenceDate).Hours() / 24)
	seasonOffset := daysSince / 56
	currentSeason := anchorSeason + seasonOffset
	currentWeek := ((daysSince / 7) % 8) + 1
	return currentSeason, currentWeek
}

func CheckMinistrySchedule(store *db.Store, botToken string) {
	// GET ALL TARGETS
	targets := store.GetBroadcastTargets("ministry_alert", "general_announcements")
	if len(targets) == 0 {
		return
	}

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
			for _, route := range targets {
				_ = SendMinistryManifest(botToken, route.ChannelID, day, slots)
			}
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
				for _, route := range targets {
					pingStr := FormatDiscordPing(route.PingRoleID)
					_ = SendMinistryPing(botToken, route.ChannelID, day.BuffName, *slot.Nickname, *slot.AllianceName, pingStr)
				}
			}
		}
	}
}

func CheckPetSchedule(store *db.Store, botToken string) {
	targets := store.GetBroadcastTargets("pet_alert", "general_announcements")
	if len(targets) == 0 {
		return
	}

	now := time.Now().UTC()
	var slotId int
	var buffTime string

	if now.Hour() == 11 && now.Minute() == 50 {
		slotId = 1
		buffTime = "12:00 UTC"
	} else if now.Hour() == 13 && now.Minute() == 50 {
		slotId = 2
		buffTime = "14:00 UTC"
	} else if now.Hour() == 15 && now.Minute() == 20 {
		slotId = 3
		buffTime = "15:30 UTC"
	} else {
		return
	}

	today := now.Format("2006-01-02")
	captains, err := store.GetCaptainsForPetSlot(today, slotId)

	if err == nil && len(captains) > 0 {
		for _, route := range targets {
			pingStr := FormatDiscordPing(route.PingRoleID)
			_ = SendPetPing(botToken, route.ChannelID, buffTime, captains, pingStr)
		}
	}
}

func TriggerRotationCron(store *db.Store, botToken string, anchorDate string, anchorSeason int) {
	targets := store.GetBroadcastTargets("fortress_rotation", "general_announcements")
	if len(targets) == 0 {
		log.Println("CRON: No Discord targets configured for rotation. Skipping.")
		return
	}

	liveSeason, liveWeek := GetRotationState(anchorDate, anchorSeason)
	entries, err := store.GetRotationForWeek(liveSeason, liveWeek)

	if err != nil || len(entries) == 0 {
		log.Printf("CRON: No rotation data found for S%d W%d. Skipping.", liveSeason, liveWeek)
		return
	}

	for _, route := range targets {
		pingStr := FormatDiscordPing(route.PingRoleID)
		msg := "🚨 Fortress Rotation Updated!"
		if pingStr != "" {
			msg = pingStr + "\n" + msg
		}

		if err := SendDiscordRotation(botToken, route.ChannelID, liveSeason, liveWeek, entries, msg); err != nil {
			log.Printf("CRON Error sending to %s: %v", route.ChannelID, err)
		}
	}
}
