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
		Password: password,
		DB:       db,
	})

	return &RedisStore{Client: rdb}
}

func (r *RedisStore) AcquireJobLock(jobID string) bool {
	success, err := r.Client.SetNX(ctx, "global_job_lock", jobID, 24*time.Hour).Result()
	if err != nil {
		return false
	}
	return success
}

func (r *RedisStore) ReleaseJobLock() {
	r.Client.Del(ctx, "global_job_lock")
}

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

	r.Client.Set(ctx, fmt.Sprintf("job_progress:%s", jobID), data, 1*time.Hour)

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

func (r *RedisStore) GetLoginAttempts(ip string) int {
	key := "failed_login:" + ip
	val, _ := r.Client.Get(ctx, key).Int()
	return val
}

func (r *RedisStore) RecordFailedLogin(ip string) {
	key := "failed_login:" + ip
	count, _ := r.Client.Incr(ctx, key).Result()
	if count == 1 {
		r.Client.Expire(ctx, key, 15*time.Minute)
	}
}

func (r *RedisStore) ClearLoginAttempts(ip string) {
	r.Client.Del(ctx, "failed_login:"+ip)
}

func (r *RedisStore) SetMfaSession(token, username string) {
	// Store the temporary token for 5 minutes
	r.Client.Set(ctx, "mfa_session:"+token, username, 5*time.Minute)
}

func (r *RedisStore) GetMfaSession(token string) string {
	val, _ := r.Client.Get(ctx, "mfa_session:"+token).Result()
	return val
}

func (r *RedisStore) DeleteMfaSession(token string) {
	r.Client.Del(ctx, "mfa_session:"+token)
}
