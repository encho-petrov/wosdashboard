package db

import (
	"database/sql"
	"errors"
	"time"
)

type TransferSeason struct {
	ID                      int          `db:"id" json:"id"`
	Name                    string       `db:"name" json:"name"`
	PowerCap                int64        `db:"power_cap" json:"powerCap"`
	IsLeading               bool         `db:"is_leading" json:"isLeading"`
	SpecialInvitesAvailable int          `db:"special_invites_available" json:"specialInvitesAvailable"`
	NormalInvitesAvailable  int          `db:"normal_invites_available" json:"normalInvitesAvailable"`
	Status                  string       `db:"status" json:"status"`
	CreatedAt               time.Time    `db:"created_at" json:"createdAt"`
	ClosedAt                sql.NullTime `db:"closed_at" json:"closedAt"`
}

type TransferRecord struct {
	ID               int       `db:"id" json:"id"`
	SeasonID         int       `db:"season_id" json:"seasonId"`
	FID              int64     `db:"fid" json:"fid"`
	Direction        string    `db:"direction" json:"direction"`
	Nickname         string    `db:"nickname" json:"nickname"`
	FurnaceLevel     int       `db:"furnace_level" json:"furnaceLevel"`
	Power            int64     `db:"power" json:"power"`
	SourceState      string    `db:"source_state" json:"sourceState"`
	TargetAllianceID *int      `db:"target_alliance_id" json:"targetAllianceId"`
	InviteType       string    `db:"invite_type" json:"inviteType"`
	Status           string    `db:"status" json:"status"`
	CreatedAt        time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time `db:"updated_at" json:"updatedAt"`
	Avatar           string    `db:"avatar" json:"avatar"`
	FurnaceImage     string    `db:"furnace_image" json:"furnaceImage"`
}

func (s *Store) GetActiveTransferSeason() (*TransferSeason, error) {
	var ts TransferSeason
	err := s.db.Get(&ts, "SELECT * FROM transfer_seasons WHERE status IN ('Planning', 'Active') ORDER BY created_at DESC LIMIT 1")
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &ts, err
}

func (s *Store) CreateTransferSeason(name string, powerCap int64, isLeading bool, specials int, normals int) error {
	query := `INSERT INTO transfer_seasons (name, power_cap, is_leading, special_invites_available, normal_invites_available, status) 
              VALUES (?, ?, ?, ?, ?, 'Planning')`
	_, err := s.db.Exec(query, name, powerCap, isLeading, specials, normals)
	return err
}

func (s *Store) GetTransferRecords(seasonID int) ([]TransferRecord, error) {
	var records []TransferRecord
	query := `SELECT * FROM transfer_records WHERE season_id = ? 
              ORDER BY FIELD(status, 'Pending', 'Confirmed', 'Declined'), created_at DESC`
	err := s.db.Select(&records, query, seasonID)
	return records, err
}

func (s *Store) UpdateTransferRecord(id int, power int64, targetAllianceID *int, inviteType string, status string) error {
	query := `UPDATE transfer_records SET power = ?, target_alliance_id = ?, invite_type = ?, status = ? WHERE id = ?`
	_, err := s.db.Exec(query, power, targetAllianceID, inviteType, status, id)
	return err
}

func (s *Store) AddTransferRecord(record TransferRecord) error {
	query := `INSERT INTO transfer_records 
        (season_id, fid, direction, nickname, furnace_level, source_state, status, avatar, furnace_image) 
        VALUES (:season_id, :fid, 'Inbound', :nickname, :furnace_level, :source_state, 'Pending', :avatar, :furnace_image)`
	_, err := s.db.NamedExec(query, record)
	return err
}

func (s *Store) ConfirmInboundTransfer(recordID int, fid int64, nickname string, targetAllianceID int) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec("UPDATE transfer_records SET status = 'Confirmed' WHERE id = ?", recordID); err != nil {
		return err
	}

	upsertQuery := `
        INSERT INTO players (player_id, nickname, alliance_id, status) 
        VALUES (?, ?, ?, 'Active') 
        ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), alliance_id = VALUES(alliance_id), status = 'Active'`
	if _, err = tx.Exec(upsertQuery, fid, nickname, targetAllianceID); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) ConfirmOutboundTransfer(fid int64, seasonID int, nickname string, destState string) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var p struct {
		Power      int64   `db:"normal_power"`
		AllianceID *int    `db:"alliance_id"`
		Avatar     *string `db:"avatar_image"`
	}
	err = tx.Get(&p, "SELECT normal_power, alliance_id, avatar_image FROM players WHERE player_id = ?", fid)
	if err != nil {
		return err
	}

	if _, err = tx.Exec("UPDATE players SET status = 'Archived', alliance_id = NULL, team_id = NULL WHERE player_id = ?", fid); err != nil {
		return err
	}

	insertQuery := `
        INSERT INTO transfer_records (season_id, fid, direction, nickname, source_state, status, power, target_alliance_id, avatar) 
        VALUES (?, ?, 'Outbound', ?, ?, 'Confirmed', ?, ?, ?)`

	if _, err = tx.Exec(insertQuery, seasonID, fid, nickname, destState, p.Power, p.AllianceID, p.Avatar); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) GetClosedTransferSeasons() ([]TransferSeason, error) {
	var seasons []TransferSeason
	query := "SELECT * FROM transfer_seasons WHERE status = 'Closed' ORDER BY closed_at DESC"
	err := s.db.Select(&seasons, query)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []TransferSeason{}, nil
		}
		return nil, err
	}
	return seasons, nil
}

func (s *Store) UpdateSeasonStatus(seasonID int, status string) error {
	_, err := s.db.Exec("UPDATE transfer_seasons SET status = ? WHERE id = ?", status, seasonID)
	return err
}

func (s *Store) UpdateTransferSeasonParams(id int, powerCap int64, specials int, normals int) error {
	query := `UPDATE transfer_seasons SET power_cap = ?, special_invites_available = ?, normal_invites_available = ? WHERE id = ?`
	_, err := s.db.Exec(query, powerCap, specials, normals, id)
	return err
}
