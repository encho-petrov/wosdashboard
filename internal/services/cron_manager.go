package services

import (
	"gift-redeemer/internal/db"
	"log"
	"sync"

	"github.com/robfig/cron/v3"
)

type CronManager struct {
	cron     *cron.Cron
	store    *db.Store
	botToken string

	jobMap   map[int]cron.EntryID
	mapMutex sync.RWMutex
}

func NewCronManager(store *db.Store, botToken string) *CronManager {
	return &CronManager{
		cron:     cron.New(cron.WithParser(cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor))),
		store:    store,
		botToken: botToken,
		jobMap:   make(map[int]cron.EntryID),
	}
}

func (cm *CronManager) Start() {
	cm.cron.Start()
	log.Println("🚀 Dynamic Cron Engine started")
	cm.ReloadAllSchedules()
}

func (cm *CronManager) Stop() {
	cm.cron.Stop()
	log.Println("🛑 Dynamic Cron Engine stopped")
}

func (cm *CronManager) ReloadAllSchedules() {
	cm.mapMutex.Lock()
	defer cm.mapMutex.Unlock()

	for _, entryID := range cm.jobMap {
		cm.cron.Remove(entryID)
	}
	cm.jobMap = make(map[int]cron.EntryID)

	crons, err := cm.store.GetAllActiveCustomCrons()
	if err != nil {
		log.Printf("CRON Engine Error: Failed to load schedules from DB: %v", err)
		return
	}

	count := 0
	for _, sched := range crons {
		err := cm.scheduleJobUnsafe(sched)
		if err != nil {
			log.Printf("CRON Engine Warning: Failed to mount job %d: %v", sched.ID, err)
		} else {
			count++
		}
	}
	log.Printf("CRON Engine: Successfully mounted %d active custom schedules.", count)
}

func (cm *CronManager) AddOrUpdateJob(sched db.DiscordCustomCron) error {
	cm.mapMutex.Lock()
	defer cm.mapMutex.Unlock()

	if existingID, exists := cm.jobMap[sched.ID]; exists {
		cm.cron.Remove(existingID)
		delete(cm.jobMap, sched.ID)
	}

	if sched.IsActive {
		return cm.scheduleJobUnsafe(sched)
	}
	return nil
}

func (cm *CronManager) RemoveJob(scheduleID int) {
	cm.mapMutex.Lock()
	defer cm.mapMutex.Unlock()

	if entryID, exists := cm.jobMap[scheduleID]; exists {
		cm.cron.Remove(entryID)
		delete(cm.jobMap, scheduleID)
		log.Printf("CRON Engine: Unmounted job %d", scheduleID)
	}
}

func (cm *CronManager) scheduleJobUnsafe(sched db.DiscordCustomCron) error {
	entryID, err := cm.cron.AddFunc(sched.CronExpression, func() {

		pingStr := FormatDiscordPing(sched.PingRoleID)

		err := SendCustomDiscordEmbed(cm.botToken, sched.ChannelID, "⏰ Automatic Reminder", sched.Message, 3447003, pingStr)
		if err != nil {
			log.Printf("CRON Error: Job %d failed to send payload to %s: %v", sched.ID, sched.ChannelID, err)
		}
	})

	if err != nil {
		return err
	}

	cm.jobMap[sched.ID] = entryID
	return nil
}
