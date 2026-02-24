package db

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

type UserSafe struct {
	ID          int    `db:"id" json:"id"`
	Username    string `db:"username" json:"username"`
	Role        string `db:"role" json:"role"`
	AllianceID  *int   `db:"alliance_id" json:"allianceId"`
	MFAEnabled  bool   `db:"mfa_enabled" json:"mfa_enabled"`
	HasWebAuthn bool   `db:"has_webauthn" json:"has_webauthn"`
}

type User struct {
	ID            int                   `db:"id"`
	Username      string                `db:"username"`
	PasswordHash  string                `db:"password_hash"`
	Role          string                `db:"role"`
	AllianceID    *int                  `db:"alliance_id"`
	MFASecret     string                `db:"mfa_secret" json:"-"`
	MFAEnabled    bool                  `db:"mfa_enabled" json:"mfa_enabled"`
	WebAuthnCreds []webauthn.Credential `db:"-" json:"-"`
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
	query := `SELECT 
            u.id, 
            u.username, 
            u.role, 
            u.alliance_id, 
            u.mfa_enabled,
            EXISTS (
                SELECT 1 
                FROM webauthn_credentials wc 
                WHERE wc.user_id = u.id
            ) AS has_webauthn
        FROM users u
        ORDER BY u.id ASC
        `
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

func (u *User) WebAuthnID() []byte {
	return []byte(fmt.Sprintf("%d", u.ID))
}

func (u *User) WebAuthnName() string {
	return u.Username
}

func (u *User) WebAuthnDisplayName() string {
	return u.Username
}

func (u *User) WebAuthnIcon() string {
	return ""
}

func (u *User) WebAuthnCredentials() []webauthn.Credential {
	return u.WebAuthnCreds
}

func (s *Store) LoadWebAuthnCredentials(user *User) error {
	var rows []struct {
		Data string `db:"credential_data"`
	}

	query := `SELECT credential_data FROM webauthn_credentials WHERE user_id = ?`
	err := s.db.Select(&rows, query, user.ID)
	if err != nil {
		return err
	}

	var creds []webauthn.Credential
	for _, r := range rows {
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(r.Data), &c); err == nil {
			creds = append(creds, c)
		}
	}
	user.WebAuthnCreds = creds
	return nil
}

func (s *Store) SaveWebAuthnCredential(userID int, cred *webauthn.Credential) error {
	data, err := json.Marshal(cred)
	if err != nil {
		return err
	}

	query := `INSERT INTO webauthn_credentials (user_id, credential_id, credential_data) VALUES (?, ?, ?)`
	_, err = s.db.Exec(query, userID, cred.ID, string(data))
	return err
}

func (s *Store) HasWebAuthn(userID int) bool {
	var count int
	err := s.db.Get(&count, `SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = ?`, userID)
	return err == nil && count > 0
}

func (s *Store) ResetUserMFA(userID int) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	queryUsers := `UPDATE users SET mfa_enabled = false, mfa_secret = '' WHERE id = ?`
	if _, err := tx.Exec(queryUsers, userID); err != nil {
		return err
	}

	queryWebAuthn := `DELETE FROM webauthn_credentials WHERE user_id = ?`
	if _, err := tx.Exec(queryWebAuthn, userID); err != nil {
		return err
	}

	return tx.Commit()
}
