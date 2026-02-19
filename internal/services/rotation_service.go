package services

import (
	"fmt"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"time"
)

func CalculateUpcomingWeek(referenceDateStr string) (int, int) {
	referenceDate, _ := time.Parse("2006-12-21", referenceDateStr)
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

func SendDiscordRotation(cfg models.DiscordConfig, week int, entries []db.RotationEntryExtended) error {
	message := fmt.Sprintf("🛡️ **State Rotation Update: Week %d** 🛡️\n\n", week)

	for _, entry := range entries {
		message += fmt.Sprintf("• %s %d -> %s\n",
			entry.BuildingType,
			entry.InternalID,
			entry.AllianceName,
		)
	}

	// (HTTP Post logic...)

	return nil
}
