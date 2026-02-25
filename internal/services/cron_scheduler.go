package services

import (
	"gift-redeemer/internal/db"
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

func CalculateCurrentWeek(referenceDateStr string) (int, int) {
	referenceDate, _ := time.Parse("2006-01-02", referenceDateStr)
	daysSince := int(time.Since(referenceDate).Hours() / 24)

	seasonNumber := (daysSince / 56) + 1
	currentWeek := ((daysSince / 7) % 8) + 1

	return seasonNumber, currentWeek
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
