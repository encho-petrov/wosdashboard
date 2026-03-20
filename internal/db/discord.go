package db

import (
	"time"
)

type DiscordGuild struct {
	GuildID    string    `db:"guild_id" json:"guildId"`
	AllianceID *int      `db:"alliance_id" json:"allianceId"`
	GuildName  string    `db:"guild_name" json:"guildName"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
}

type DiscordRoute struct {
	ID         int       `db:"id" json:"id"`
	AllianceID *int      `db:"alliance_id" json:"allianceId"`
	EventType  string    `db:"event_type" json:"eventType"`
	ChannelID  string    `db:"channel_id" json:"channelId"`
	PingRoleID *string   `db:"ping_role_id" json:"pingRoleId"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
}

type DiscordSchedule struct {
	ID             int       `db:"id" json:"id"`
	AllianceID     *int      `db:"alliance_id" json:"allianceId"`
	JobName        string    `db:"job_name" json:"jobName"`
	CronExpression string    `db:"cron_expression" json:"cronExpression"`
	ChannelID      string    `db:"channel_id" json:"channelId"`
	MessagePayload string    `db:"message_payload" json:"messagePayload"`
	IsActive       bool      `db:"is_active" json:"isActive"`
	CreatedAt      time.Time `db:"created_at" json:"createdAt"`
}

func (s *Store) UpsertDiscordGuild(guildID string, guildName string, allianceID *int) error {
	query := `
        INSERT INTO discord_guilds (guild_id, guild_name, alliance_id) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), alliance_id = VALUES(alliance_id)
    `
	_, err := s.db.Exec(query, guildID, guildName, allianceID)
	return err
}

func (s *Store) UpsertDiscordRoute(allianceID *int, eventType, channelID string, pingRoleID *string) error {
	if allianceID == nil {
		s.db.Exec("DELETE FROM discord_routes WHERE alliance_id IS NULL AND event_type = ?", eventType)
	} else {
		s.db.Exec("DELETE FROM discord_routes WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	}

	query := `
        INSERT INTO discord_routes (alliance_id, event_type, channel_id, ping_role_id)
        VALUES (?, ?, ?, ?)
    `
	_, err := s.db.Exec(query, allianceID, eventType, channelID, pingRoleID)
	return err
}

func (s *Store) GetActiveSchedules() ([]DiscordSchedule, error) {
	var schedules []DiscordSchedule
	err := s.db.Select(&schedules, "SELECT * FROM discord_schedules WHERE is_active = TRUE")
	if schedules == nil {
		schedules = []DiscordSchedule{}
	}
	return schedules, err
}

func (s *Store) CreateSchedule(schedule *DiscordSchedule) error {
	query := `
        INSERT INTO discord_schedules (alliance_id, job_name, cron_expression, channel_id, message_payload, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    `
	res, err := s.db.Exec(query, schedule.AllianceID, schedule.JobName, schedule.CronExpression, schedule.ChannelID, schedule.MessagePayload, schedule.IsActive)
	if err != nil {
		return err
	}

	id, _ := res.LastInsertId()
	schedule.ID = int(id)
	return nil
}

func (s *Store) UpdateScheduleStatus(scheduleID int, isActive bool) error {
	_, err := s.db.Exec("UPDATE discord_schedules SET is_active = ? WHERE id = ?", isActive, scheduleID)
	return err
}

func (s *Store) DeleteSchedule(scheduleID int) error {
	_, err := s.db.Exec("DELETE FROM discord_schedules WHERE id = ?", scheduleID)
	return err
}

func (s *Store) GetAllRoutesForAlliance(allianceID *int) ([]DiscordRoute, error) {
	var routes []DiscordRoute
	var err error
	if allianceID == nil {
		err = s.db.Select(&routes, "SELECT * FROM discord_routes WHERE alliance_id IS NULL")
	} else {
		err = s.db.Select(&routes, "SELECT * FROM discord_routes WHERE alliance_id = ?", allianceID)
	}
	if routes == nil {
		routes = []DiscordRoute{}
	}
	return routes, err
}

func (s *Store) GetGuildByAlliance(allianceID *int) (*DiscordGuild, error) {
	var guild DiscordGuild
	if allianceID == nil {
		err := s.db.Get(&guild, "SELECT * FROM discord_guilds WHERE alliance_id IS NULL")
		if err != nil {
			return nil, err
		}
		return &guild, nil
	}

	err := s.db.Get(&guild, "SELECT * FROM discord_guilds WHERE alliance_id = ?", allianceID)
	if err != nil {
		return nil, err
	}
	return &guild, nil
}

func (s *Store) GetRouteForEvent(allianceID *int, eventType string) (*DiscordRoute, error) {
	var route DiscordRoute
	if allianceID == nil {
		err := s.db.Get(&route, "SELECT * FROM discord_routes WHERE alliance_id IS NULL AND event_type = ? ORDER BY id DESC LIMIT 1", eventType)
		if err != nil {
			return nil, err
		}
		return &route, nil
	}

	err := s.db.Get(&route, "SELECT * FROM discord_routes WHERE alliance_id = ? AND event_type = ? ORDER BY id DESC LIMIT 1", allianceID, eventType)
	if err != nil {
		return nil, err
	}
	return &route, nil
}

func (s *Store) GetAllianceRoutes(allianceEvent string) ([]DiscordRoute, error) {
	var routes []DiscordRoute
	err := s.db.Select(&routes, "SELECT * FROM discord_routes WHERE alliance_id IS NOT NULL AND event_type = ?", allianceEvent)

	if routes == nil {
		routes = []DiscordRoute{}
	}
	return routes, err
}

func (s *Store) GetBroadcastTargets(stateEvent string, allianceEvent string) []DiscordRoute {
	var targets []DiscordRoute

	stateRoute, err := s.GetRouteForEvent(nil, stateEvent)
	if err == nil && stateRoute != nil {
		targets = append(targets, *stateRoute)
	}

	var allianceRoutes []DiscordRoute
	err = s.db.Select(&allianceRoutes, "SELECT * FROM discord_routes WHERE alliance_id IS NOT NULL AND event_type = ?", allianceEvent)
	if err == nil {
		targets = append(targets, allianceRoutes...)
	}

	return targets
}

func (s *Store) GetCustomCronByID(id int) (DiscordCustomCron, error) {
	var cron DiscordCustomCron
	err := s.db.Get(&cron, "SELECT * FROM discord_custom_crons WHERE id = ?", id)
	return cron, err
}

func (s *Store) DeleteDiscordRoute(allianceID *int, eventType string) error {
	if allianceID == nil {
		_, err := s.db.Exec("DELETE FROM discord_routes WHERE alliance_id IS NULL AND event_type = ?", eventType)
		return err
	}
	_, err := s.db.Exec("DELETE FROM discord_routes WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	return err
}

func (s *Store) DisconnectDiscordServer(allianceID *int) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}

	if allianceID == nil {
		// 1. Delete State Routes
		_, err = tx.Exec("DELETE FROM discord_routes WHERE alliance_id IS NULL")
		if err != nil {
			tx.Rollback()
			return err
		}

		// 2. Delete State Custom Crons
		_, err = tx.Exec("DELETE FROM discord_custom_crons WHERE alliance_id IS NULL")
		if err != nil {
			tx.Rollback()
			return err
		}

		// 3. Delete State Config
		_, err = tx.Exec("DELETE FROM discord_configs WHERE alliance_id IS NULL")
		if err != nil {
			tx.Rollback()
			return err
		}
	} else {
		// 1. Delete Alliance Routes
		_, err = tx.Exec("DELETE FROM discord_routes WHERE alliance_id = ?", allianceID)
		if err != nil {
			tx.Rollback()
			return err
		}

		// 2. Delete Alliance Custom Crons
		_, err = tx.Exec("DELETE FROM discord_custom_crons WHERE alliance_id = ?", allianceID)
		if err != nil {
			tx.Rollback()
			return err
		}

		// 3. Delete Alliance Config
		_, err = tx.Exec("DELETE FROM discord_configs WHERE alliance_id = ?", allianceID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) GetDiscordGuildID(allianceID *int) (string, error) {
	var guildID string
	var err error
	if allianceID == nil {
		err = s.db.Get(&guildID, "SELECT guild_id FROM discord_configs WHERE alliance_id IS NULL")
	} else {
		err = s.db.Get(&guildID, "SELECT guild_id FROM discord_configs WHERE alliance_id = ?", allianceID)
	}
	return guildID, err
}
