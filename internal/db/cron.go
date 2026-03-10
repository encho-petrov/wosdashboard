package db

import (
	"encoding/json"
	"sort"
	"time"
)

type DiscordCustomCron struct {
	ID               int       `db:"id" json:"id"`
	AllianceID       *int      `db:"alliance_id" json:"allianceId"`
	Name             string    `db:"name" json:"name"`
	ChannelID        string    `db:"channel_id" json:"channelId"`
	NextRunTime      time.Time `db:"next_run_time" json:"nextRunTime"`
	RecurrenceType   string    `db:"recurrence_type" json:"recurrenceType"`
	RecurrenceConfig string    `db:"recurrence_config" json:"recurrenceConfig"`
	Message          string    `db:"message" json:"message"`
	PingRoleID       *string   `db:"ping_role_id" json:"pingRoleId"`
	IsActive         bool      `db:"is_active" json:"isActive"`
	CreatedAt        time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time `db:"updated_at" json:"updatedAt"`
}

func (s *Store) GetCustomCrons(allianceID *int) ([]DiscordCustomCron, error) {
	var crons []DiscordCustomCron
	var err error
	if allianceID == nil {
		err = s.db.Select(&crons, "SELECT * FROM discord_custom_crons WHERE alliance_id IS NULL ORDER BY created_at DESC")
	} else {
		err = s.db.Select(&crons, "SELECT * FROM discord_custom_crons WHERE alliance_id = ? ORDER BY created_at DESC", allianceID)
	}

	if crons == nil {
		crons = []DiscordCustomCron{}
	}
	return crons, err
}

func (s *Store) CreateCustomCron(cron *DiscordCustomCron) error {
	query := `INSERT INTO discord_custom_crons 
              (alliance_id, name, channel_id, next_run_time, recurrence_type, recurrence_config, message, ping_role_id, is_active) 
              VALUES (:alliance_id, :name, :channel_id, :next_run_time, :recurrence_type, :recurrence_config, :message, :ping_role_id, :is_active)`

	res, err := s.db.NamedExec(query, cron)
	if err == nil {
		id, _ := res.LastInsertId()
		cron.ID = int(id)
	}
	return err
}

func (s *Store) DeleteCustomCron(id int, allianceID *int) error {
	if allianceID == nil {
		_, err := s.db.Exec("DELETE FROM discord_custom_crons WHERE id = ? AND alliance_id IS NULL", id)
		return err
	}
	_, err := s.db.Exec("DELETE FROM discord_custom_crons WHERE id = ? AND alliance_id = ?", id, allianceID)
	return err
}

func (s *Store) ToggleCustomCron(id int, allianceID *int) error {
	if allianceID == nil {
		_, err := s.db.Exec("UPDATE discord_custom_crons SET is_active = NOT is_active WHERE id = ? AND alliance_id IS NULL", id)
		return err
	}
	_, err := s.db.Exec("UPDATE discord_custom_crons SET is_active = NOT is_active WHERE id = ? AND alliance_id = ?", id, allianceID)
	return err
}

func (s *Store) GetAllActiveCustomCrons() ([]DiscordCustomCron, error) {
	var crons []DiscordCustomCron
	err := s.db.Select(&crons, "SELECT * FROM discord_custom_crons WHERE is_active = true")
	if crons == nil {
		crons = []DiscordCustomCron{}
	}
	return crons, err
}

func (s *Store) GetPendingCustomCrons(now time.Time) ([]DiscordCustomCron, error) {
	var jobs []DiscordCustomCron
	query := "SELECT * FROM discord_custom_crons WHERE is_active = true AND next_run_time <= ?"

	err := s.db.Select(&jobs, query, now)
	if jobs == nil {
		jobs = []DiscordCustomCron{}
	}
	return jobs, err
}

func (s *Store) UpdateCustomCronNextRun(id int, nextRun time.Time) error {
	_, err := s.db.Exec("UPDATE discord_custom_crons SET next_run_time = ?, updated_at = NOW() WHERE id = ?", nextRun, id)
	return err
}

func (s *Store) UpdateCustomCronStatus(id int, active bool) error {
	_, err := s.db.Exec("UPDATE discord_custom_crons SET is_active = ?, updated_at = NOW() WHERE id = ?", active, id)
	return err
}

func (c *DiscordCustomCron) CalculateNextRun() time.Time {
	switch c.RecurrenceType {
	case "INTERVAL":
		var cfg struct {
			Hours int `json:"hours"`
		}
		if err := json.Unmarshal([]byte(c.RecurrenceConfig), &cfg); err != nil {
			return time.Time{}
		}
		return c.NextRunTime.Add(time.Duration(cfg.Hours) * time.Hour)

	case "WEEKLY":
		var cfg struct {
			Days  []int `json:"days"`
			Weeks int   `json:"weeks"`
		}
		if err := json.Unmarshal([]byte(c.RecurrenceConfig), &cfg); err != nil {
			return time.Time{}
		}
		return calculateWeeklyNext(c.NextRunTime, cfg.Days, cfg.Weeks)

	default:
		return time.Time{}
	}
}

func calculateWeeklyNext(current time.Time, days []int, intervalWeeks int) time.Time {
	if len(days) == 0 {
		return time.Time{}
	}

	sort.Ints(days)
	currentDay := int(current.Weekday())

	for _, d := range days {
		if d > currentDay {
			return current.AddDate(0, 0, d-currentDay)
		}
	}

	firstDayNextCycle := days[0]
	daysUntilEndOfWeek := 7 - currentDay
	weeksToJump := intervalWeeks - 1

	return current.AddDate(0, 0, daysUntilEndOfWeek+(weeksToJump*7)+firstDayNextCycle)
}

func (s *Store) UpdateCustomCron(cron *DiscordCustomCron) error {
	var query string
	if cron.AllianceID == nil {
		query = `UPDATE discord_custom_crons 
                 SET name = :name, channel_id = :channel_id, next_run_time = :next_run_time, 
                     recurrence_type = :recurrence_type, recurrence_config = :recurrence_config, 
                     message = :message, ping_role_id = :ping_role_id, updated_at = NOW() 
                 WHERE id = :id AND alliance_id IS NULL`
	} else {
		query = `UPDATE discord_custom_crons 
                 SET name = :name, channel_id = :channel_id, next_run_time = :next_run_time, 
                     recurrence_type = :recurrence_type, recurrence_config = :recurrence_config, 
                     message = :message, ping_role_id = :ping_role_id, updated_at = NOW() 
                 WHERE id = :id AND alliance_id = :alliance_id`
	}

	_, err := s.db.NamedExec(query, cron)
	return err
}
