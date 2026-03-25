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

type EventSnapshot struct {
	ID        int    `db:"id" json:"id"`
	EventDate string `db:"event_date" json:"eventDate"`
	CreatedBy string `db:"created_by" json:"createdBy"`
	Notes     string `db:"notes" json:"notes"`
}

type HistoryTeam struct {
	ID                 int    `db:"id" json:"id"`
	OriginalTeamID     int    `db:"original_team_id" json:"originalTeamId"`
	Name               string `db:"name" json:"name"`
	CaptainFID         *int64 `db:"captain_fid" json:"captainFid"`
	FightingAllianceID *int   `db:"fighting_alliance_id" json:"fightingAllianceId"`
}

type HistoryPlayer struct {
	ID                 int     `db:"id" json:"id"`
	PlayerID           int64   `db:"player_id" json:"playerId"`
	Nickname           string  `db:"nickname" json:"nickname"`
	AllianceID         *int    `db:"alliance_id" json:"allianceId"`
	TeamID             *int    `db:"team_id" json:"teamId"`
	FightingAllianceID *int    `db:"fighting_alliance_id" json:"fightingAllianceId"`
	Attendance         *string `db:"attendance" json:"attendance"`
}

type PlayerAttendance struct {
	FID        int64  `json:"fid" binding:"required"`
	Attendance string `json:"attendance" binding:"required"`
}

type WarRoomAttendanceStat struct {
	FID   int64 `db:"fid" json:"fid"`
	Score int   `db:"score" json:"score"`
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

func (s *Store) ArchiveAndResetEvent(adminUsername string, notes string, eventType string, attendance []PlayerAttendance) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO event_snapshots (created_by, notes) VALUES (?, ?)", adminUsername, notes)
	if err != nil {
		return err
	}
	eventID, _ := res.LastInsertId()

	_, err = tx.Exec(`
        INSERT INTO history_teams (event_id, original_team_id, name, captain_fid, fighting_alliance_id)
        SELECT ?, id, name, captain_fid, fighting_alliance_id 
        FROM teams 
        WHERE fighting_alliance_id IS NOT NULL
    `, eventID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
        INSERT INTO history_players (event_id, player_id, nickname, alliance_id, team_id, fighting_alliance_id)
        SELECT ?, player_id, nickname, alliance_id, team_id, fighting_alliance_id 
        FROM players 
        WHERE fighting_alliance_id IS NOT NULL OR team_id IS NOT NULL
    `, eventID)
	if err != nil {
		return err
	}

	if len(attendance) > 0 {
		stmtGlobal, err := tx.Prepare("INSERT INTO war_room_attendance (fid, event_type, status) VALUES (?, ?, ?)")
		if err != nil {
			return err
		}
		defer stmtGlobal.Close()

		stmtSnapshot, err := tx.Prepare("UPDATE history_players SET attendance = ? WHERE event_id = ? AND player_id = ?")
		if err != nil {
			return err
		}
		defer stmtSnapshot.Close()

		for _, p := range attendance {
			if _, err = stmtGlobal.Exec(p.FID, eventType, p.Attendance); err != nil {
				return err
			}

			if _, err = stmtSnapshot.Exec(p.Attendance, eventID, p.FID); err != nil {
				return err
			}
		}
	}

	_, err = tx.Exec("UPDATE alliances SET is_locked = FALSE")
	if err != nil {
		return err
	}

	_, err = tx.Exec("UPDATE players SET fighting_alliance_id = NULL, team_id = NULL, battle_availability = 'Unavailable', avail_0200 = FALSE, avail_1200 = FALSE, avail_1400 = FALSE, avail_1900 = FALSE")
	if err != nil {
		return err
	}

	_, err = tx.Exec("DELETE FROM teams WHERE fighting_alliance_id IS NOT NULL")
	if err != nil {
		return err
	}

	_, err = tx.Exec("DELETE FROM pet_skill_schedule")
	if err != nil {
		return err
	}

	_, err = tx.Exec("UPDATE war_room_state SET active_event_type = NULL WHERE id = 1")
	if err != nil {
		return err
	}

	return tx.Commit()
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

	opts.TundraAvailability = []string{"02:00", "07:00", "12:00", "14:00", "19:00", "Boost"}

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
	stats.TundraAvailability = []string{"02:00", "12:00", "14:00", "19:00"}

	return stats, err
}

func (s *Store) GetEventHistoryList() ([]EventSnapshot, error) {
	var events []EventSnapshot
	err := s.db.Select(&events, "SELECT id, event_date, created_by, notes FROM event_snapshots ORDER BY event_date DESC")
	return events, err
}

func (s *Store) GetEventSnapshotDetails(eventID int) ([]HistoryTeam, []HistoryPlayer, error) {
	var teams []HistoryTeam
	var players []HistoryPlayer

	err := s.db.Select(&teams, "SELECT id, original_team_id, name, captain_fid, fighting_alliance_id FROM history_teams WHERE event_id = ?", eventID)
	if err != nil {
		return nil, nil, err
	}

	err = s.db.Select(&players, "SELECT id, player_id, nickname, alliance_id, team_id, fighting_alliance_id, attendance FROM history_players WHERE event_id = ?", eventID)
	if err != nil {
		return nil, nil, err
	}

	return teams, players, nil
}

func (s *Store) GetWarRoomBroadcastRoutes() ([]DiscordRoute, error) {
	var routes []DiscordRoute
	query := "SELECT * FROM discord_routes WHERE event_type IN ('global_war_room', 'war_room_deploy')"
	err := s.db.Select(&routes, query)

	if routes == nil {
		routes = []DiscordRoute{}
	}
	return routes, err
}

func (s *Store) GetWarRoomAttendanceStats(eventType string) ([]WarRoomAttendanceStat, error) {
	query := `
        SELECT 
            fid,
            ROUND(
                (SUM(
                    CASE 
                        WHEN status = 'Attended' THEN 1.0 
                        WHEN status = 'Majority' THEN 0.75 
                        WHEN status = 'Minimal' THEN 0.25 
                        ELSE 0 
                    END
                ) * 100.0) / 
                NULLIF(SUM(CASE WHEN status IN ('Attended', 'Majority', 'Minimal', 'Missed') THEN 1 ELSE 0 END), 0)
            ) as score
        FROM war_room_attendance
        WHERE event_type = ?
        GROUP BY fid
        HAVING SUM(CASE WHEN status IN ('Attended', 'Majority', 'Minimal', 'Missed') THEN 1 ELSE 0 END) > 0
    `
	var stats []WarRoomAttendanceStat
	err := s.db.Select(&stats, query, eventType)

	if err != nil {
		return nil, err
	}
	return stats, nil
}

func (s *Store) GetWarRoomSession() (string, error) {
	var eventType *string
	err := s.db.Get(&eventType, "SELECT active_event_type FROM war_room_state WHERE id = 1")
	if err != nil {
		return "", err
	}
	if eventType == nil {
		return "", nil
	}
	return *eventType, nil
}

func (s *Store) SetWarRoomSession(eventType string) error {
	_, err := s.db.Exec("UPDATE war_room_state SET active_event_type = ? WHERE id = 1", eventType)
	return err
}
