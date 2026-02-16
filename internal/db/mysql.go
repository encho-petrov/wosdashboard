package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

type JsonNullString struct {
	sql.NullString
}

// MarshalJSON for JsonNullString
func (v JsonNullString) MarshalJSON() ([]byte, error) {
	if v.Valid {
		return json.Marshal(v.String)
	}
	return json.Marshal(nil)
}

type JsonNullTime struct {
	sql.NullTime
}

func (v JsonNullTime) MarshalJSON() ([]byte, error) {
	if v.Valid {
		return json.Marshal(v.Time)
	}
	return json.Marshal(nil)
}

type jobRecordDB struct {
	JobID             string         `db:"job_id"`
	InitiatedByUserID sql.NullInt64  `db:"initiated_by_user_id"` // ADDED THIS
	GiftCodes         string         `db:"gift_codes"`
	Status            string         `db:"status"`
	TotalPlayers      int            `db:"total_players"`
	ProcessedPlayers  int            `db:"processed_players"`
	CreatedAt         time.Time      `db:"created_at"`
	CompletedAt       sql.NullTime   `db:"completed_at"`
	ReportPath        sql.NullString `db:"report_path"`
}

type JobResponse struct {
	JobID            string     `json:"jobId"`
	InitiatedBy      int64      `json:"initiatedBy"` // We will send 0 if null
	GiftCodes        string     `json:"giftCodes"`
	Status           string     `json:"status"`
	TotalPlayers     int        `json:"totalPlayers"`
	ProcessedPlayers int        `json:"processedPlayers"`
	CreatedAt        time.Time  `json:"createdAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	ReportPath       *string    `json:"reportPath"`
}

type PlayerProfile struct {
	FID         int64  `db:"player_id" json:"fid"`
	Nickname    string `db:"nickname" json:"nickname"`
	Avatar      string `db:"avatar_image" json:"avatar"`
	StoveLv     int    `db:"stove_lv" json:"stoveLv"`
	StoveImg    string `db:"stove_lv_content" json:"stoveImg"`
	TroopType   string `db:"troop_type" json:"troopType"`
	TundraPower int64  `db:"tundra_power" json:"tundraPower"`

	// This ensures JSON receives "Name" or null, not {String: "Name", Valid: true}
	AllianceName *string `db:"alliance_name" json:"allianceName"`
	TeamName     *string `db:"team_name" json:"teamName"`
	CaptainName  *string `db:"captain_name" json:"captainName"`
}

type UserSafe struct {
	ID       int    `db:"id" json:"id"`
	Username string `db:"username" json:"username"`
	Role     string `db:"role" json:"role"`
}

type User struct {
	ID           int    `db:"id"`
	Username     string `db:"username"`
	PasswordHash string `db:"password_hash"`
	Role         string `db:"role"`
	AllianceID   *int   `db:"alliance_id"`
}

type PlayerRow struct {
	FID       int64  `db:"player_id" json:"fid"`
	Nickname  string `db:"nickname" json:"nickname"`
	Avatar    string `db:"avatar_image" json:"avatar"`
	StoveLv   int    `db:"stove_lv" json:"stoveLv"`
	Power     int64  `db:"tundra_power" json:"power"`
	TroopType string `db:"troop_type" json:"troopType"`

	AllianceID   *int    `db:"alliance_id" json:"allianceId"`
	AllianceName *string `db:"alliance_name" json:"allianceName"`
	TeamID       *int    `db:"team_id" json:"teamId"`
	TeamName     *string `db:"team_name" json:"teamName"`
}

type AllianceOption struct {
	ID   int    `db:"id" json:"id"`
	Name string `db:"name" json:"name"`
}

type TeamOption struct {
	ID         int    `db:"id" json:"id"`
	Name       string `db:"name" json:"name"`
	AllianceID int    `db:"alliance_id" json:"allianceId"`
}

type Store struct {
	db *sqlx.DB
}

func NewStore(user, pass, host, dbName string) (*Store, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true", user, pass, host, dbName)
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) GetPendingPlayers(code string, limit int) ([]int64, error) {
	var fids []int64

	query := `
		SELECT p.player_id 
		FROM players p 
		LEFT JOIN player_gift_codes gc 
			ON p.player_id = gc.player_id 
			AND gc.gift_code = ?
			AND gc.redeemed_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
		WHERE gc.player_id IS NULL
		LIMIT ?`

	err := s.db.Select(&fids, query, code, limit)
	return fids, err
}

func (s *Store) MarkAsRedeemed(fid int64, code string) error {
	// 1. Ensure Player Exists
	s.db.Exec("INSERT IGNORE INTO players (player_id) VALUES (?)", fid)

	query := `
        INSERT INTO player_gift_codes (player_id, gift_code, redeemed_at)
        VALUES (?, ?, NOW())
    `

	_, err := s.db.Exec(query, fid, code)
	if err != nil {
		log.Printf("[DB ERROR] Failed to mark redeemed: %v", err)
		return err
	}
	return nil
}

func (s *Store) AddPlayers(fids []int64) (added int, skipped int, err error) {
	if len(fids) == 0 {
		return 0, 0, nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare("INSERT IGNORE INTO players (player_id) VALUES (?)")
	if err != nil {
		return 0, 0, err
	}
	defer stmt.Close()
	addedCount := 0
	for _, fid := range fids {
		res, err := stmt.Exec(fid)
		if err != nil {
			return addedCount, 0, err
		}
		rows, _ := res.RowsAffected()
		addedCount += int(rows)
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	skipped = len(fids) - addedCount
	return addedCount, skipped, nil
}

func (s *Store) CreateJobRecord(jobID string, codes []string, userID int64) error {
	codesJson := fmt.Sprintf("%v", codes)
	query := `INSERT INTO jobs (job_id, initiated_by_user_id, gift_codes, status, created_at) VALUES (?, ?, ?, 'PENDING', NOW())`
	_, err := s.db.Exec(query, jobID, userID, codesJson)
	return err
}

func (s *Store) UpdateJobStatus(jobID string, status string, processed, total int) error {
	query := `UPDATE jobs SET status = ?, processed_players = ?, total_players = ? WHERE job_id = ?`
	_, err := s.db.Exec(query, status, processed, total, jobID)
	return err
}

func (s *Store) CompleteJob(jobID, reportPath string) error {
	query := `UPDATE jobs SET status = 'COMPLETED', completed_at = NOW(), report_path = ? WHERE job_id = ?`
	_, err := s.db.Exec(query, reportPath, jobID)
	return err
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	var user User
	query := `SELECT id, username, password_hash, role, alliance_id FROM users WHERE username = ?`
	err := s.db.Get(&user, query, username)
	return &user, err
}

func (s *Store) CreateUser(username, passwordHash, role string, allianceId int) error {
	query := `INSERT INTO users (username, password_hash, role, alliance_id) VALUES (?, ?, ?, ?)`
	_, err := s.db.Exec(query, username, passwordHash, role, allianceId)
	return err
}

func (s *Store) UpdatePassword(username, newHash string) error {
	query := `UPDATE users SET password_hash = ? WHERE username = ?`
	_, err := s.db.Exec(query, newHash, username)
	return err
}

func (s *Store) GetRecentJobs() ([]JobResponse, error) {
	var rawJobs []jobRecordDB

	// We can now safely use SELECT * because our struct matches the table
	// But explicit selection is still safer for long-term maintenance
	query := `
		SELECT 
			job_id, initiated_by_user_id, gift_codes, status, 
			total_players, processed_players, created_at, 
			completed_at, report_path 
		FROM jobs 
		ORDER BY created_at DESC 
		LIMIT 50
	`

	if err := s.db.Select(&rawJobs, query); err != nil {
		return nil, err
	}

	// Map DB Struct -> API Struct
	var apiJobs []JobResponse
	for _, raw := range rawJobs {
		job := JobResponse{
			JobID:            raw.JobID,
			GiftCodes:        raw.GiftCodes,
			Status:           raw.Status,
			TotalPlayers:     raw.TotalPlayers,
			ProcessedPlayers: raw.ProcessedPlayers,
			CreatedAt:        raw.CreatedAt,
		}

		// Handle Nulls
		if raw.InitiatedByUserID.Valid {
			job.InitiatedBy = raw.InitiatedByUserID.Int64
		} else {
			job.InitiatedBy = 0 // "System" or "Legacy"
		}

		if raw.CompletedAt.Valid {
			t := raw.CompletedAt.Time
			job.CompletedAt = &t
		}

		if raw.ReportPath.Valid {
			str := raw.ReportPath.String
			job.ReportPath = &str
		}

		apiJobs = append(apiJobs, job)
	}

	return apiJobs, nil
}

func (s *Store) GetAllUsers() ([]UserSafe, error) {
	var users []UserSafe
	// Select only safe fields
	query := `SELECT id, username, role FROM users ORDER BY id ASC`
	err := s.db.Select(&users, query)
	return users, err
}

func (s *Store) DeleteUser(id int) error {
	_, err := s.db.Exec("DELETE FROM users WHERE id = ?", id)
	return err
}

func (s *Store) UpsertPlayer(fid int64, nick string, kid, stoveLv int, stoveImg, avatar string) error {
	// ON DUPLICATE KEY UPDATE: If player exists, just update their info
	query := `
		INSERT INTO players (player_id, nickname, kid, stove_lv, stove_lv_content, avatar_image)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			nickname = VALUES(nickname),
			kid = VALUES(kid),
			stove_lv = VALUES(stove_lv),
			stove_lv_content = VALUES(stove_lv_content),
			avatar_image = VALUES(avatar_image),
			last_api_refresh = NOW()
	`
	_, err := s.db.Exec(query, fid, nick, kid, stoveLv, stoveImg, avatar)
	return err
}

func (s *Store) GetPlayerProfile(fid int64) (*PlayerProfile, error) {
	// Ensure query uses correct column names
	query := `
		SELECT 
			p.player_id, p.nickname, p.avatar_image, p.stove_lv, p.stove_lv_content, 
			p.troop_type, p.tundra_power,
			a.name AS alliance_name,
			t.name AS team_name,
			c.nickname AS captain_name
		FROM players p
		LEFT JOIN alliances a ON p.alliance_id = a.id
		LEFT JOIN teams t ON p.team_id = t.id
		LEFT JOIN players c ON t.captain_fid = c.player_id 
		WHERE p.player_id = ?
	`
	// Note: Changed t.captain_fid = c.player_id above to match your schema change

	var profile PlayerProfile
	err := s.db.Get(&profile, query, fid)
	return &profile, err
}

func (s *Store) GetPlayers(allianceFilter *int) ([]PlayerRow, error) {
	query := `
		SELECT 
			p.player_id, p.nickname, p.avatar_image, p.stove_lv, p.tundra_power, p.troop_type,
			p.alliance_id, a.name AS alliance_name,
			p.team_id, t.name AS team_name
		FROM players p
		LEFT JOIN alliances a ON p.alliance_id = a.id
		LEFT JOIN teams t ON p.team_id = t.id
	`

	var args []interface{}

	if allianceFilter != nil {
		query += " WHERE p.alliance_id = ?"
		args = append(args, *allianceFilter)
	}

	query += " ORDER BY p.tundra_power DESC, p.stove_lv DESC"

	var players []PlayerRow
	err := s.db.Select(&players, query, args...)
	return players, err
}

func (s *Store) UpdatePlayerDetails(fid int64, power int64, troopType string, allianceID *int, teamID *int) error {
	query := `
		UPDATE players 
		SET tundra_power = ?, troop_type = ?, alliance_id = ?, team_id = ? 
		WHERE player_id = ?
	`
	_, err := s.db.Exec(query, power, troopType, allianceID, teamID, fid)
	return err
}

func (s *Store) GetAlliances() ([]AllianceOption, error) {
	var list []AllianceOption
	err := s.db.Select(&list, "SELECT id, name FROM alliances ORDER BY name ASC")
	return list, err
}

func (s *Store) GetTeams() ([]TeamOption, error) {
	var list []TeamOption
	err := s.db.Select(&list, "SELECT id, name, alliance_id FROM teams ORDER BY name ASC")
	return list, err
}

func (s *Store) GetIncompletePlayers() ([]int64, error) {
	// UPDATED: Selects players if they are missing a nickname OR an avatar OR have level 0
	query := `
        SELECT player_id 
        FROM players 
        WHERE nickname IS NULL 
           OR nickname = '' 
           OR avatar_image IS NULL 
           OR avatar_image = '' 
           OR stove_lv = 0
    `
	var ids []int64
	err := s.db.Select(&ids, query)
	return ids, err
}
