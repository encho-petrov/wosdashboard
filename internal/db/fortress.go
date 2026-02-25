package db

import (
	"database/sql"
	"fmt"
)

type Building struct {
	ID         int    `db:"id" json:"id"`
	InternalID int    `db:"internal_id" json:"internal_id"`
	Type       string `db:"type" json:"type"`
}

type BuildingReward struct {
	BuildingID int    `db:"building_id" json:"building_id"`
	Week       int    `db:"week_number" json:"week"`
	Name       string `db:"reward_name" json:"name"`
	Icon       string `db:"reward_icon" json:"icon"`
}

type RotationEntry struct {
	SeasonID   int `db:"season_id" json:"seasonId"`
	Week       int `db:"week_number" json:"week"`
	BuildingID int `db:"building_id" json:"buildingId"`
	AllianceID int `db:"alliance_id" json:"allianceId"`
}

type RotationEntryExtended struct {
	Week         int    `db:"week_number" json:"week"`
	InternalID   int    `db:"internal_id" json:"internalId"`
	BuildingType string `db:"building_type" json:"buildingType"`
	AllianceName string `db:"alliance_name" json:"allianceName"`
}

func (s *Store) SaveSeasonRotation(seasonID int, entries []RotationEntry) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	type checkKey struct {
		week int
		item string
	}
	limits := make(map[checkKey]map[int]int)

	for _, e := range entries {
		var bType string
		err := tx.Get(&bType, "SELECT type FROM buildings WHERE id = ?", e.BuildingID)
		if err != nil {
			return err
		}

		key := checkKey{e.Week, bType}
		if limits[key] == nil {
			limits[key] = make(map[int]int)
		}

		limits[key][e.AllianceID]++

		maxLimit := 1
		if bType == "Fortress" {
			maxLimit = 3
			if e.Week == 1 {
				maxLimit = 1
			} else if e.Week == 2 {
				maxLimit = 2
			}
		}

		if limits[key][e.AllianceID] > maxLimit {
			return fmt.Errorf("Conflict: Alliance %d assigned %d %ss in Week %d (Max %d)",
				e.AllianceID, limits[key][e.AllianceID], bType, e.Week, maxLimit)
		}
	}

	_, err = tx.Exec("DELETE FROM rotation_schedule WHERE season_id = ?", seasonID)
	if err != nil {
		return err
	}

	query := `INSERT INTO rotation_schedule (season_id, week_number, building_id, alliance_id) 
              VALUES (:season_id, :week_number, :building_id, :alliance_id)`
	_, err = tx.NamedExec(query, entries)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) GetAllBuildings() ([]Building, error) {
	var buildings []Building
	err := s.db.Select(&buildings, "SELECT id, internal_id, type FROM buildings ORDER BY type DESC, internal_id ASC")
	return buildings, err
}

func (s *Store) GetSeasonSchedule(seasonID int) ([]RotationEntry, error) {
	var schedule []RotationEntry
	query := `SELECT season_id, week_number, building_id, alliance_id 
              FROM rotation_schedule 
              WHERE season_id = ?`
	err := s.db.Select(&schedule, query, seasonID)
	return schedule, err
}

func (s *Store) GetWeeklyRewards(week int) ([]BuildingReward, error) {
	var rewards []BuildingReward
	query := `SELECT building_id, week_number, reward_name, reward_icon 
              FROM building_rewards 
              WHERE week_number = ?`
	err := s.db.Select(&rewards, query, week)
	return rewards, err
}

func (s *Store) GetRotationForWeek(seasonID int, week int) ([]RotationEntryExtended, error) {
	var results []RotationEntryExtended

	query := `
        SELECT 
            rs.week_number, 
            b.internal_id, 
            b.type AS building_type, 
            a.name AS alliance_name
        FROM rotation_schedule rs
        JOIN buildings b ON rs.building_id = b.id
        LEFT JOIN alliances a ON rs.alliance_id = a.id
        WHERE rs.week_number = ? AND rs.season_id = ?
        ORDER BY b.type DESC, b.internal_id ASC`

	err := s.db.Select(&results, query, week, seasonID)
	return results, err
}

func (s *Store) GetPlayerAllianceID(fid int64) (int, error) {
	var allianceID sql.NullInt64
	err := s.db.Get(&allianceID, "SELECT alliance_id FROM players WHERE player_id = ?", fid)
	if err != nil {
		return 0, err
	}
	if !allianceID.Valid {
		return 0, fmt.Errorf("player is not in an alliance")
	}
	return int(allianceID.Int64), nil
}

func (s *Store) GetAllianceRotationForWeek(seasonID int, week int, allianceID int) ([]RotationEntryExtended, error) {
	var results []RotationEntryExtended
	query := `
        SELECT 
            rs.week_number, 
            b.internal_id, 
            b.type AS building_type, 
            a.name AS alliance_name
        FROM rotation_schedule rs
        JOIN buildings b ON rs.building_id = b.id
        JOIN alliances a ON rs.alliance_id = a.id
        WHERE rs.week_number = ? AND rs.season_id = ? AND rs.alliance_id = ?
        ORDER BY b.type DESC, b.internal_id ASC`

	err := s.db.Select(&results, query, week, seasonID, allianceID)
	return results, err
}

func (s *Store) GetActiveFortSeason() (int, int, error) {
	var seasonID int

	query := "SELECT COALESCE(MAX(season_id), 1) FROM rotation_schedule"
	err := s.db.Get(&seasonID, query)

	currentWeek := 1

	return seasonID, currentWeek, err
}
