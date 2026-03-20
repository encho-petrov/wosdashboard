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

type AllianceEventHistory struct {
	ID        int    `db:"id" json:"id"`
	EventDate string `db:"event_date" json:"eventDate"`
	CreatedBy string `db:"created_by" json:"createdBy"`
	Notes     string `db:"notes" json:"notes"`
}

type AllianceEventHistoryPlayer struct {
	ID         int    `db:"id" json:"id"`
	PlayerID   int64  `db:"player_id" json:"playerId"`
	Nickname   string `db:"nickname" json:"nickname"`
	LegionID   int    `db:"legion_id" json:"legionId"`
	IsSub      bool   `db:"is_sub" json:"isSub"`
	Attendance string `db:"attendance" json:"attendance"`
}

type AttendanceStat struct {
	PlayerID int64 `db:"player_id" json:"playerId"`
	Score    int   `db:"score" json:"score"`
}

func (s *Store) GetAllianceEventState(allianceID int, eventType string) ([]AllianceEventLegion, []AllianceEventPlayer, []AttendanceStat, error) {
	var legions []AllianceEventLegion
	var roster []AllianceEventPlayer
	var stats []AttendanceStat

	err := s.db.Select(&legions, "SELECT legion_id, is_locked FROM alliance_event_legions WHERE alliance_id = ? AND event_type = ?", allianceID, eventType)
	if err != nil {
		return nil, nil, nil, err
	}

	err = s.db.Select(&roster, "SELECT aer.player_id, aer.legion_id, aer.is_sub, aer.attendance FROM alliance_event_roster aer LEFT JOIN players p ON aer.player_id = p.player_id WHERE aer.alliance_id = ? AND aer.event_type = ? ORDER BY p.tundra_power DESC", allianceID, eventType)
	if err != nil {
		return nil, nil, nil, err
	}

	statsQuery := `
        SELECT 
            hp.player_id, 
            CAST(ROUND(
                SUM(CASE WHEN hp.attendance = 'Attended' THEN 1 ELSE 0 END) * 100.0 / 
                NULLIF(SUM(CASE WHEN hp.attendance IN ('Attended', 'Missed') THEN 1 ELSE 0 END), 0)
            , 0) AS SIGNED) as score
        FROM alliance_event_history_players hp
        JOIN alliance_event_history h ON hp.history_id = h.id
        WHERE h.event_type = ?
        GROUP BY hp.player_id
    `
	_ = s.db.Select(&stats, statsQuery, eventType)

	return legions, roster, stats, nil
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

func (s *Store) GetAllianceHistoryList(allianceID int, eventType string) ([]AllianceEventHistory, error) {
	var list []AllianceEventHistory
	err := s.db.Select(&list, "SELECT id, event_date, created_by, notes FROM alliance_event_history WHERE alliance_id = ? AND event_type = ? ORDER BY event_date DESC", allianceID, eventType)
	if list == nil {
		list = []AllianceEventHistory{}
	}
	return list, err
}

func (s *Store) GetAllianceHistorySnapshot(historyID int, allianceID int) ([]AllianceEventHistoryPlayer, error) {
	var players []AllianceEventHistoryPlayer
	err := s.db.Select(&players, `
        SELECT p.id, p.player_id, p.nickname, p.legion_id, p.is_sub, p.attendance
        FROM alliance_event_history_players p
        JOIN alliance_event_history h ON p.history_id = h.id
        WHERE p.history_id = ? AND h.alliance_id = ?
    `, historyID, allianceID)
	if players == nil {
		players = []AllianceEventHistoryPlayer{}
	}
	return players, err
}
