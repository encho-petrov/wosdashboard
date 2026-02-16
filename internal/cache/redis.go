package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

var ctx = context.Background()

type RedisStore struct {
	Client *redis.Client
}

func NewRedisStore(host, password string, db int) *RedisStore {
	rdb := redis.NewClient(&redis.Options{
		Addr:     host,
		Password: password, // no password set
		DB:       db,       // use default DB
	})

	return &RedisStore{Client: rdb}
}

// Global Lock for the Job Runner
func (r *RedisStore) AcquireJobLock(jobID string) bool {
	// SetNX = SET if Not Exists
	// We set a key "job_running" with value "jobID".
	// If it already exists, this returns false.
	success, err := r.Client.SetNX(ctx, "global_job_lock", jobID, 24*time.Hour).Result()
	if err != nil {
		return false
	}
	return success
}

func (r *RedisStore) ReleaseJobLock() {
	r.Client.Del(ctx, "global_job_lock")
}

// Real-time Dashboard Updates
type JobProgress struct {
	JobID     string `json:"job_id"`
	Total     int    `json:"total"`
	Processed int    `json:"processed"`
	Status    string `json:"status"`
}

func (r *RedisStore) SetJobProgress(jobID string, current, total int, status string) {
	progress := JobProgress{
		JobID:     jobID,
		Total:     total,
		Processed: current,
		Status:    status,
	}
	data, _ := json.Marshal(progress)

	// Store in Redis (Expire after 1 hour)
	r.Client.Set(ctx, fmt.Sprintf("job_progress:%s", jobID), data, 1*time.Hour)

	// Also update a "Current Job" key for easy frontend fetching
	r.Client.Set(ctx, "current_job_status", data, 1*time.Hour)
}

func (r *RedisStore) GetCurrentJobStatus() *JobProgress {
	val, err := r.Client.Get(ctx, "current_job_status").Result()
	if err != nil {
		// Key doesn't exist (no job running/recent)
		return nil
	}

	var progress JobProgress
	if err := json.Unmarshal([]byte(val), &progress); err != nil {
		return nil
	}
	return &progress
}
