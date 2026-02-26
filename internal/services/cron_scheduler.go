package services

import (
	"gift-redeemer/internal/db"
	"time"
)

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
			_ = SendMinistryManifest(webhookURL, day, slots)
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
				_ = SendMinistryPing(webhookURL, day.BuffName, *slot.Nickname, *slot.AllianceName)
			}
		}
	}
}

func GetRotationState(anchorDateStr string, anchorSeason int) (int, int) {
	referenceDate, _ := time.Parse("2006-01-02", anchorDateStr)

	daysSince := int(time.Since(referenceDate).Hours() / 24)

	seasonOffset := daysSince / 56
	currentSeason := anchorSeason + seasonOffset

	currentWeek := ((daysSince / 7) % 8) + 1

	return currentSeason, currentWeek
}

func CheckPetSchedule(store *db.Store, webhookURL string) {
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
		_ = SendPetPing(webhookURL, buffTime, captains)
	}
}
