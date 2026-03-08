package db

import "time"

type DiscordCustomCron struct {
	ID             int       `db:"id" json:"id"`
	AllianceID     *int      `db:"alliance_id" json:"allianceId"`
	ChannelID      string    `db:"channel_id" json:"channelId"`
	CronExpression string    `db:"cron_expression" json:"cronExpression"`
	Message        string    `db:"message" json:"message"`
	PingRoleID     *string   `db:"ping_role_id" json:"pingRoleId"`
	IsActive       bool      `db:"is_active" json:"isActive"`
	CreatedAt      time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt      time.Time `db:"updated_at" json:"updatedAt"`
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
	query := `INSERT INTO discord_custom_crons (alliance_id, channel_id, cron_expression, message, ping_role_id, is_active) 
              VALUES (:alliance_id, :channel_id, :cron_expression, :message, :ping_role_id, :is_active)`

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
