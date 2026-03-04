package db

type AllianceEventPlayer struct {
	PlayerID   int64  `db:"player_id" json:"fid"`
	LegionID   int    `db:"legion_id" json:"legionId"`
	IsSub      bool   `db:"is_sub" json:"isSub"`
	Attendance string `db:"attendance" json:"attendance"`
}

type AllianceEventLegion struct {
	LegionID int  `db:"legion_id" json:"legionId"`
	IsLocked bool `db:"is_locked" json:"isLocked"`
}

func (s *Store) GetAllianceEventState(allianceID int, eventType string) ([]AllianceEventLegion, []AllianceEventPlayer, error) {
	var legions []AllianceEventLegion
	var roster []AllianceEventPlayer

	err := s.db.Select(&legions, "SELECT legion_id, is_locked FROM alliance_event_legions WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	if err != nil {
		return nil, nil, err
	}

	err = s.db.Select(&roster, "SELECT player_id, legion_id, is_sub, attendance FROM alliance_event_roster WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)

	return legions, roster, err
}

func (s *Store) DeployAllianceEventPlayer(allianceID int, eventType string, playerID int64, targetLegion *int, isSub bool) error {
	if targetLegion == nil {
		// Remove from board
		_, err := s.db.Exec("DELETE FROM alliance_event_roster WHERE alliance_id = ? AND event_type = ? AND player_id = ?", allianceID, eventType, playerID)
		return err
	}

	_, err := s.db.Exec(`
        INSERT INTO alliance_event_roster (alliance_id, event_type, player_id, legion_id, is_sub) 
        VALUES (?, ?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE legion_id = ?, is_sub = ?`,
		allianceID, eventType, playerID, *targetLegion, isSub, *targetLegion, isSub)
	return err
}

func (s *Store) ToggleAllianceEventLock(allianceID int, eventType string, legionID int, isLocked bool) error {
	_, err := s.db.Exec(`
        INSERT INTO alliance_event_legions (alliance_id, event_type, legion_id, is_locked) 
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE is_locked = ?`,
		allianceID, eventType, legionID, isLocked, isLocked)
	return err
}

func (s *Store) UpdateAllianceEventAttendance(allianceID int, eventType string, playerID int64, status string) error {
	_, err := s.db.Exec("UPDATE alliance_event_roster SET attendance = ? WHERE alliance_id = ? AND event_type = ? AND player_id = ?",
		status, allianceID, eventType, playerID)
	return err
}

func (s *Store) ArchiveAllianceEvent(allianceID int, eventType string, adminUsername string, notes string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO alliance_event_history (alliance_id, event_type, created_by, notes) VALUES (?, ?, ?, ?)", allianceID, eventType, adminUsername, notes)
	if err != nil {
		return err
	}
	historyID, _ := res.LastInsertId()

	_, err = tx.Exec(`
        INSERT INTO alliance_event_history_players (history_id, player_id, nickname, legion_id, is_sub, attendance)
        SELECT ?, r.player_id, p.nickname, r.legion_id, r.is_sub, r.attendance 
        FROM alliance_event_roster r
        JOIN players p ON r.player_id = p.player_id
        WHERE r.alliance_id = ? AND r.event_type = ?
    `, historyID, allianceID, eventType)
	if err != nil {
		return err
	}

	_, err = tx.Exec("DELETE FROM alliance_event_roster WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	if err != nil {
		return err
	}

	_, err = tx.Exec("UPDATE alliance_event_legions SET is_locked = FALSE WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	if err != nil {
		return err
	}

	return tx.Commit()
}
