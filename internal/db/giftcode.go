package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

type jobRecordDB struct {
	JobID             string         `db:"job_id"`
	InitiatedByUserID sql.NullInt64  `db:"initiated_by_user_id"`
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
	InitiatedBy      int64      `json:"initiatedBy"`
	GiftCodes        string     `json:"giftCodes"`
	Status           string     `json:"status"`
	TotalPlayers     int        `json:"totalPlayers"`
	ProcessedPlayers int        `json:"processedPlayers"`
	CreatedAt        time.Time  `json:"createdAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	ReportPath       *string    `json:"reportPath"`
}

func (s *Store) MarkAsRedeemed(fid int64, code string) error {
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
	return err
}

func (s *Store) CompleteJob(jobID, status, reportPath string) error {
	query := `UPDATE jobs SET status = ?, completed_at = NOW(), report_path = ? WHERE job_id = ?`
	_, err := s.db.Exec(query, status, reportPath, jobID)
	return err
}

func (s *Store) GetRecentJobs() ([]JobResponse, error) {
	var rawJobs []jobRecordDB

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

		if raw.InitiatedByUserID.Valid {
			job.InitiatedBy = raw.InitiatedByUserID.Int64
		} else {
			job.InitiatedBy = 0
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

func (s *Store) CreateJob(initiatedBy int64, codes, status string, total int) (string, error) {
	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())

	query := `INSERT INTO jobs (job_id, initiated_by_user_id, gift_codes, status, total_players, processed_players, created_at) 
	          VALUES (?, ?, ?, ?, ?, 0, NOW())`

	_, err := s.db.Exec(query, jobID, initiatedBy, codes, status, total)
	return jobID, err
}

func (s *Store) UpdateJobProgress(jobID string, processed int) error {
	_, err := s.db.Exec("UPDATE jobs SET processed_players = ? WHERE job_id = ?", processed, jobID)
	return err
}
