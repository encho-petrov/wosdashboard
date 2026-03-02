package db

import (
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
)

type FilterOptions struct {
	TroopTypes         []string `json:"troopTypes"`
	BattleAvailability []string `json:"battleAvailability"`
	TundraAvailability []string `json:"tundraAvailability"`
}

type RosterStats struct {
	TroopTypes         []string `json:"troopTypes"`
	BattleAvailability []string `json:"battleAvailability"`
	TundraAvailability []string `json:"tundraAvailability"`
}

type TeamOption struct {
	ID         int    `db:"id" json:"id"`
	Name       string `db:"name" json:"name"`
	AllianceID int    `db:"alliance_id" json:"allianceId"`
}

type WarStats struct {
	ID          int    `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	MemberCount int    `db:"member_count" json:"memberCount"`
	TotalPower  int64  `db:"total_power" json:"totalPower"`
	IsLocked    bool   `db:"is_locked" json:"isLocked"`
}

type Squad struct {
	ID          int    `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	CaptainFID  int64  `db:"captain_fid" json:"captainFid"`
	MemberCount int    `db:"member_count" json:"memberCount"`
	TotalPower  int64  `db:"total_power" json:"totalPower"`
}

func (s *Store) GetTeams() ([]TeamOption, error) {
	var list []TeamOption
	err := s.db.Select(&list, "SELECT id, name, alliance_id FROM teams ORDER BY name ASC")
	return list, err
}

func (s *Store) BulkAssignFightingAlliance(playerIDs []int64, allianceID *int) error {
	query, args, err := sqlx.In("UPDATE players SET fighting_alliance_id = ? WHERE player_id IN (?)", allianceID, playerIDs)
	if err != nil {
		return err
	}
	query = s.db.Rebind(query)
	_, err = s.db.Exec(query, args...)
	return err
}

func (s *Store) GetWarStats() ([]WarStats, error) {
	query := `
        SELECT 
            a.id, 
            a.name, 
            a.is_locked,
            COUNT(p.player_id) as member_count,
            COALESCE(SUM(p.tundra_power), 0) as total_power
        FROM alliances a
        LEFT JOIN players p ON a.id = p.fighting_alliance_id
        WHERE a.type = 'Fighting'
        GROUP BY a.id, a.name, a.is_locked
    `
	var stats []WarStats
	err := s.db.Select(&stats, query)
	return stats, err
}

func (s *Store) ToggleAllianceLock(allianceID int, isLocked bool) error {
	_, err := s.db.Exec("UPDATE alliances SET is_locked = ? WHERE id = ?", isLocked, allianceID)
	return err
}

func (s *Store) ResetEvent() error {
	_, err := s.db.Exec("UPDATE alliances SET is_locked = FALSE")
	if err != nil {
		return err
	}

	_, err = s.db.Exec("UPDATE players SET fighting_alliance_id = NULL, team_id = NULL, battle_availability = 'Unavailable', tundra_availability = 'Unavailable'")
	if err != nil {
		return err
	}

	_, err = s.db.Exec("DELETE FROM teams WHERE fighting_alliance_id IS NOT NULL")

	return err
}

func (s *Store) PromoteCaptain(fid int64, fightingAllianceID int) error {
	var player struct {
		Nickname   string `db:"nickname"`
		AllianceID *int   `db:"alliance_id"`
	}

	query := "SELECT nickname, alliance_id FROM players WHERE player_id = ?"
	if err := s.db.Get(&player, query, fid); err != nil {
		return fmt.Errorf("failed to fetch player data: %v", err)
	}

	res, err := s.db.Exec(`
        INSERT INTO teams (name, captain_fid, fighting_alliance_id, alliance_id) 
        VALUES (?, ?, ?, ?)`,
		player.Nickname+"'s Squad", fid, fightingAllianceID, player.AllianceID,
	)

	if err != nil {
		return fmt.Errorf("failed to create team: %v", err)
	}

	teamID, _ := res.LastInsertId()
	_, err = s.db.Exec("UPDATE players SET team_id = ? WHERE player_id = ?", teamID, fid)

	return err
}

func (s *Store) DemoteCaptain(teamID int) error {
	_, err := s.db.Exec("UPDATE players SET team_id = NULL WHERE team_id = ?", teamID)
	if err != nil {
		return err
	}

	_, err = s.db.Exec("DELETE FROM teams WHERE id = ?", teamID)
	return err
}

func (s *Store) GetSquads(fightingAllianceID int) ([]Squad, error) {
	query := `
        SELECT t.id, t.name, t.captain_fid, 
               COUNT(p.player_id) as member_count,
               COALESCE(SUM(p.tundra_power), 0) as total_power
        FROM teams t
        LEFT JOIN players p ON t.id = p.team_id
        WHERE t.fighting_alliance_id = ?
        GROUP BY t.id, t.name, t.captain_fid
    `
	var squads []Squad
	err := s.db.Select(&squads, query, fightingAllianceID)
	return squads, err
}

func (s *Store) AssignToSquad(fid int64, teamID *int) error {
	_, err := s.db.Exec("UPDATE players SET team_id = ? WHERE player_id = ?", teamID, fid)
	return err
}

func (s *Store) GetWarRoomFilterOptions() (FilterOptions, error) {
	var opts FilterOptions

	err := s.db.Select(&opts.TroopTypes, "SELECT DISTINCT COALESCE(troop_type, 'None') FROM players WHERE troop_type IS NOT NULL")
	if err != nil {
		return opts, err
	}

	err = s.db.Select(&opts.BattleAvailability, "SELECT DISTINCT COALESCE(battle_availability, 'Unavailable') FROM players")
	if err != nil {
		return opts, err
	}

	err = s.db.Select(&opts.TundraAvailability, "SELECT DISTINCT COALESCE(tundra_availability, 'Unavailable') FROM players")

	return opts, err
}

func (s *Store) GetRosterStats() (RosterStats, error) {
	var stats RosterStats

	getEnumOptions := func(columnName string) ([]string, error) {
		var rawType string
		query := `
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'players' AND COLUMN_NAME = ? AND TABLE_SCHEMA = DATABASE()`

		err := s.db.Get(&rawType, query, columnName)
		if err != nil {
			return nil, err
		}

		rawType = strings.TrimPrefix(rawType, "enum(")
		rawType = strings.TrimSuffix(rawType, ")")
		rawType = strings.ReplaceAll(rawType, "'", "")

		return strings.Split(rawType, ","), nil
	}

	var err error
	stats.TroopTypes, err = getEnumOptions("troop_type")
	stats.BattleAvailability, err = getEnumOptions("battle_availability")
	stats.TundraAvailability, err = getEnumOptions("tundra_availability")

	return stats, err
}
