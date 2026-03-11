package services

import (
	"gift-redeemer/internal/db"
	"log"
	"sync"
	"time"
)

type CronManager struct {
	store    *db.Store
	botToken string
	stopChan chan struct{}
	stopOnce sync.Once
}

func NewCronManager(store *db.Store, botToken string) *CronManager {
	return &CronManager{
		store:    store,
		botToken: botToken,
		stopChan: make(chan struct{}),
	}
}

func (cm *CronManager) Start() {
	log.Println("🚀 Custom Rule Scheduler started (60s Ticker)")

	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				cm.processPendingCustomJobs()

				CheckMinistrySchedule(cm.store, cm.botToken)
				CheckPetSchedule(cm.store, cm.botToken)

			case <-cm.stopChan:
				return
			}
		}
	}()
}

func (cm *CronManager) processPendingCustomJobs() {
	now := time.Now().UTC()

	jobs, err := cm.store.GetPendingCustomCrons(now)
	if err != nil {
		log.Printf("CRON_MANAGER DB Error: %v", err)
		return
	}

	for _, job := range jobs {
		pingStr := FormatDiscordPing(job.PingRoleID)
		err := SendCustomDiscordEmbed(cm.botToken, job.ChannelID, "⏰ Scheduled Reminder", job.Message, 3447003, pingStr)
		if err != nil {
			log.Printf("CRON_MANAGER Dispatch Error (Job %d): %v", job.ID, err)
		}

		nextTime := job.CalculateNextRun()

		if nextTime.IsZero() {
			_ = cm.store.UpdateCustomCronStatus(job.ID, false)
			log.Printf("CRON_MANAGER: Job %d completed and deactivated", job.ID)
		} else {
			_ = cm.store.UpdateCustomCronNextRun(job.ID, nextTime)
			log.Printf("CRON_MANAGER: Job %d rescheduled for %v", job.ID, nextTime)
		}
	}
}

func (cm *CronManager) Stop() {
	cm.stopOnce.Do(func() {
		log.Println("🛑 Custom Rule Scheduler stopping...")
		close(cm.stopChan)
	})
}
