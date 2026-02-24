package db

import "time"

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
	MFASecret    string `db:"mfa_secret" json:"-"`
	MFAEnabled   bool   `db:"mfa_enabled" json:"mfa_enabled"`
}

type AuditLog struct {
	ID        int64     `db:"id" json:"id"`
	UserID    int64     `db:"user_id" json:"user_id"`
	Action    string    `db:"action" json:"action"`
	Details   string    `db:"details" json:"details"`
	IPAddress string    `db:"ip_address" json:"ip_address"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UserName  string    `db:"username" json:"username"`
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	var user User
	query := `SELECT id, username, password_hash, role, mfa_secret, mfa_enabled, alliance_id FROM users WHERE username = ?`
	err := s.db.Get(&user, query, username)
	return &user, err
}

func (s *Store) CreateUser(username, passwordHash, role string, allianceId int) error {
	var dbAllianceID interface{}
	if allianceId == 0 {
		dbAllianceID = nil
	} else {
		dbAllianceID = allianceId
	}
	query := `INSERT INTO users (username, password_hash, role, alliance_id) VALUES (?, ?, ?, ?)`
	_, err := s.db.Exec(query, username, passwordHash, role, dbAllianceID)
	return err
}

func (s *Store) UpdatePassword(username, newHash string) error {
	query := `UPDATE users SET password_hash = ? WHERE username = ?`
	_, err := s.db.Exec(query, newHash, username)
	return err
}

func (s *Store) GetAllUsers() ([]UserSafe, error) {
	var users []UserSafe
	query := `SELECT id, username, role FROM users ORDER BY id ASC`
	err := s.db.Select(&users, query)
	return users, err
}

func (s *Store) DeleteUser(id int) error {
	_, err := s.db.Exec("DELETE FROM users WHERE id = ?", id)
	return err
}

func (s *Store) EnableUserMFA(id int64, secret string) error {
	_, err := s.db.Exec("UPDATE users SET mfa_secret = ?, mfa_enabled = TRUE WHERE id = ?", secret, id)
	return err
}

func (s *Store) CreateAuditLog(log AuditLog) error {
	query := `INSERT INTO audit_logs (user_id, action, details, ip_address) 
              VALUES (?, ?, ?, ?)`
	_, err := s.db.Exec(query, log.UserID, log.Action, log.Details, log.IPAddress)
	return err
}

func (s *Store) GetAuditLogs() ([]AuditLog, error) {
	var logs []AuditLog
	query := `SELECT a.*, u.username as username 
              FROM audit_logs a 
              LEFT JOIN users u ON a.user_id = u.id 
              ORDER BY a.created_at DESC LIMIT 200`
	err := s.db.Select(&logs, query)
	return logs, err
}
