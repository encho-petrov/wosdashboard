package db

import (
	"database/sql"
	"time"
)

type AllianceTransfer struct {
	ID             int        `db:"id" json:"id"`
	TargetUserID   int64      `db:"target_user_id" json:"targetUserId"`
	RequestedBy    int64      `db:"requested_by" json:"requestedBy"`
	FromAllianceID *int       `db:"from_alliance_id" json:"fromAllianceId"`
	ToAllianceID   *int       `db:"to_alliance_id" json:"toAllianceId"`
	Status         string     `db:"status" json:"status"`
	CreatedAt      time.Time  `db:"created_at" json:"createdAt"`
	ResolvedAt     *time.Time `db:"resolved_at" json:"resolvedAt"`
	ResolvedBy     *int64     `db:"resolved_by" json:"resolvedBy"`

	TargetUsername string  `db:"target_username" json:"targetUsername"`
	RequesterName  string  `db:"requester_name" json:"requesterName"`
	ToAllianceName *string `db:"to_alliance_name" json:"toAllianceName"`
	ResolverName   *string `db:"resolver_name" json:"resolverName"`
}

func (s *Store) CreateAlliance(name, aType string) error {
	_, err := s.db.Exec("INSERT INTO alliances (name, type) VALUES (?, ?)", name, aType)
	return err
}

func (s *Store) UpdateAlliance(id int, name, aType string) error {
	_, err := s.db.Exec("UPDATE alliances SET name = ?, type = ? WHERE id = ?", name, aType, id)
	return err
}

func (s *Store) DeleteAlliance(id int) error {
	_, err := s.db.Exec("DELETE FROM alliances WHERE id = ?", id)
	return err
}

func (s *Store) CreateTransferRequest(targetUserID, requestedBy int64, fromAlliance, toAlliance *int) error {
	query := `INSERT INTO alliance_transfers 
		(target_user_id, requested_by, from_alliance_id, to_alliance_id, status) 
		VALUES (?, ?, ?, ?, 'Pending')`
	_, err := s.db.Exec(query, targetUserID, requestedBy, fromAlliance, toAlliance)
	return err
}

func (s *Store) GetPendingTransfers(userID int64, allianceID *int) ([]AllianceTransfer, error) {
	var transfers []AllianceTransfer

	query := `
		SELECT 
			t.id, t.target_user_id, t.requested_by, t.from_alliance_id, t.to_alliance_id, t.status, t.created_at,
			u.username AS target_username, 
			r.username AS requester_name, 
			a.name AS to_alliance_name
		FROM alliance_transfers t
		JOIN users u ON t.target_user_id = u.id
		JOIN users r ON t.requested_by = r.id
		LEFT JOIN alliances a ON t.to_alliance_id = a.id
		WHERE t.status = 'Pending'
	`

	var args []interface{}

	if userID != 1 {
		if allianceID == nil {
			return []AllianceTransfer{}, nil
		}
		query += ` AND t.to_alliance_id = ?`
		args = append(args, *allianceID)
	}

	query += ` ORDER BY t.created_at ASC`

	err := s.db.Select(&transfers, query, args...)
	return transfers, err
}

func (s *Store) ResolveTransfer(transferID int, status string, resolvedBy int64) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	updateTransferQuery := `
		UPDATE alliance_transfers 
		SET status = ?, resolved_at = ?, resolved_by = ? 
		WHERE id = ? AND status = 'Pending'`

	res, err := tx.Exec(updateTransferQuery, status, time.Now(), resolvedBy, transferID)
	if err != nil {
		return err
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	if status == "Approved" {
		var toAllianceID *int
		var targetUserID int64
		err = tx.QueryRowx(`SELECT to_alliance_id, target_user_id FROM alliance_transfers WHERE id = ?`, transferID).Scan(&toAllianceID, &targetUserID)
		if err != nil {
			return err
		}

		updateUserQuery := `UPDATE users SET alliance_id = ? WHERE id = ?`
		_, err = tx.Exec(updateUserQuery, toAllianceID, targetUserID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) GetUserAlliance(userID int64) (*int, error) {
	var allianceID *int
	err := s.db.QueryRow("SELECT alliance_id FROM users WHERE id = ?", userID).Scan(&allianceID)
	return allianceID, err
}

func (s *Store) UpdateUserAlliance(userID int64, newAllianceID *int) error {
	_, err := s.db.Exec("UPDATE users SET alliance_id = ? WHERE id = ?", newAllianceID, userID)
	return err
}

func (s *Store) LogAutoApprovedTransfer(targetUserID, requestedBy int64, fromAlliance, toAlliance *int) error {
	query := `INSERT INTO alliance_transfers 
		(target_user_id, requested_by, from_alliance_id, to_alliance_id, status, resolved_at, resolved_by) 
		VALUES (?, ?, ?, ?, 'Approved', NOW(), ?)`
	_, err := s.db.Exec(query, targetUserID, requestedBy, fromAlliance, toAlliance, requestedBy)
	return err
}
