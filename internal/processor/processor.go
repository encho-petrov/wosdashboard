package processor

import (
	"fmt"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/captcha"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/reports"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"
)

const WorkerCount = 4

var (
	isPaused   bool
	pauseMutex sync.RWMutex
	pauseUntil time.Time
)

type Processor struct {
	PlayerClient *client.PlayerClient
	GiftClient   *client.GiftClient
	Store        *db.Store
	Solver       *captcha.Solver
	Redis        *cache.RedisStore
	JobQueue     chan *models.RedeemJob
}

func NewProcessor(pClient *client.PlayerClient, gClient *client.GiftClient, store *db.Store, solver *captcha.Solver, redis *cache.RedisStore) *Processor {
	return &Processor{
		PlayerClient: pClient,
		GiftClient:   gClient,
		Store:        store,
		Solver:       solver,
		Redis:        redis,
		JobQueue:     make(chan *models.RedeemJob, 100),
	}
}

// Helper to check if we can run a job (wraps Redis lock)
func (p *Processor) CanStartJob(jobID string) bool {
	return p.Redis.AcquireJobLock(jobID)
}

func (p *Processor) StartWorker() {
	log.Println("Worker: Engine started, waiting for jobs...")
	for job := range p.JobQueue {
		// 1. Create DB Record
		err := p.Store.CreateJobRecord(job.JobID, job.GiftCodes, job.UserID)
		if err != nil {
			log.Printf("Worker: Failed to create job record: %v", err)
		}

		// 2. Run Job
		log.Printf("Worker: Processing job %s", job.JobID)
		p.processRedemption(job)

		// 3. Cleanup
		p.Redis.ReleaseJobLock()
		log.Printf("Worker: Job %s completed", job.JobID)
	}
}

func (p *Processor) processRedemption(job *models.RedeemJob) {
	var allEntries []models.RedeemJobEntry
	var entriesMutex sync.Mutex

	// Calculate total work for progress bar
	totalPlayers := 0
	processedCount := 0

	for _, code := range job.GiftCodes {
		// Just getting count first
		fids, _ := p.Store.GetPendingPlayers(code, 100000)
		totalPlayers += len(fids)
	}

	// Initial Status Update
	p.Store.UpdateJobStatus(job.JobID, "RUNNING", 0, totalPlayers)
	p.Redis.SetJobProgress(job.JobID, 0, totalPlayers, "RUNNING")

	for _, code := range job.GiftCodes {
		fids, err := p.Store.GetPendingPlayers(code, 5000) // Batch size
		if err != nil {
			log.Printf("Worker: DB Error %v", err)
			continue
		}

		if len(fids) == 0 {
			continue
		}

		log.Printf("Worker: Starting batch of %d players for code %s with %d threads", len(fids), code, WorkerCount)

		tasks := make(chan int64, len(fids))
		var wg sync.WaitGroup

		// Spawn Workers
		for i := 0; i < WorkerCount; i++ {
			wg.Add(1)
			go p.worker(code, tasks, &allEntries, &entriesMutex, &wg, &processedCount, totalPlayers, job.JobID)
			time.Sleep(3 * time.Second) // Stagger start to avoid WAF burst
		}

		for _, fid := range fids {
			tasks <- fid
		}
		close(tasks)

		wg.Wait()
	}

	// Job Finished
	filename, err := reports.ExportJobResults(job, allEntries)
	if err != nil {
		log.Printf("Failed to export: %v", err)
		p.Store.UpdateJobStatus(job.JobID, "FAILED", processedCount, totalPlayers)
		p.Redis.SetJobProgress(job.JobID, processedCount, totalPlayers, "FAILED")
	} else {
		log.Printf("Report saved: %s", filename)
		p.Store.CompleteJob(job.JobID, filename)
		p.Redis.SetJobProgress(job.JobID, totalPlayers, totalPlayers, "COMPLETED")
	}
}

func (p *Processor) worker(code string, tasks <-chan int64, allEntries *[]models.RedeemJobEntry, mu *sync.Mutex, wg *sync.WaitGroup, processedCount *int, total int, jobID string) {
	defer wg.Done()

	for fid := range tasks {
		// Circuit Breaker Check
		pauseMutex.RLock()
		if isPaused {
			wait := time.Until(pauseUntil)
			pauseMutex.RUnlock()
			if wait > 0 {
				log.Printf("[Worker] Circuit Open. Sleeping for %v...", wait)
				time.Sleep(wait)
			}
			pauseMutex.Lock()
			isPaused = false
			pauseMutex.Unlock()
		} else {
			pauseMutex.RUnlock()
		}

		// Random jitter to look human
		time.Sleep(time.Duration(2000+rand.Intn(3000)) * time.Millisecond)

		status, msg, nickname := p.redeemWithRetry(fid, code)

		// Trigger Circuit Breaker on WAF Block
		if strings.Contains(msg, "WAF_BLOCK") {
			pauseMutex.Lock()
			if !isPaused {
				log.Println("🚨 WAF BLOCK DETECTED! Pausing all workers for 60 seconds...")
				isPaused = true
				pauseUntil = time.Now().Add(60 * time.Second)
			}
			pauseMutex.Unlock()
		}

		mu.Lock()
		// Add Result
		*allEntries = append(*allEntries, models.RedeemJobEntry{
			PlayerId:     fid,
			Nickname:     nickname,
			RedeemStatus: status,
			RedeemMsg:    msg,
		})

		// Update Progress
		*processedCount++
		current := *processedCount

		// Update Redis frequently (every 5)
		if current%5 == 0 {
			p.Redis.SetJobProgress(jobID, current, total, "RUNNING")
		}
		// Update DB less frequently (every 20)
		if current%20 == 0 {
			p.Store.UpdateJobStatus(jobID, "RUNNING", current, total)
		}
		mu.Unlock()
	}
}

func (p *Processor) redeemWithRetry(fid int64, code string) (int, string, string) {
	fidStr := fmt.Sprintf("%d", fid)
	nickname := ""

	// Share connection for Keep-Alive
	p.GiftClient.SetHttpClient(p.PlayerClient.GetHttpClient())

	info, err := p.PlayerClient.GetPlayerInfo(fid)
	if err == nil && info != nil {
		nickname = info.Data.Nickname
	}
	if err != nil && strings.Contains(err.Error(), "WAF_BLOCK") {
		return -2, "WAF_BLOCK", nickname
	}

	for i := 0; i < 3; i++ {
		imgBase64, err := p.PlayerClient.GetCaptcha(fid)
		if err != nil {
			if strings.Contains(err.Error(), "WAF_BLOCK") {
				return -2, "WAF_BLOCK", nickname
			}
			log.Printf("[FID %d] Captcha Error: %v", fid, err)
			return -2, "Captcha Fetch Failed", nickname
		}

		solved, err := p.Solver.Solve(imgBase64)
		if err != nil {
			log.Printf("[FID %d] Solver Error: %v", fid, err)
			continue
		}

		errCode, msg, redeemNickname, err := p.GiftClient.RedeemGift(fidStr, code, solved)
		if err != nil {
			if strings.Contains(err.Error(), "WAF_BLOCK") {
				return -2, "WAF_BLOCK", nickname
			}
			log.Printf("[FID %d] Redeem Error: %v", fid, err)
			continue
		}

		if redeemNickname != "" {
			nickname = redeemNickname
		}

		if errCode == 0 {
			p.Store.MarkAsRedeemed(fid, code)
			return 1, "Success", nickname
		}

		// Permanent Failures (Stop Retrying)
		if strings.Contains(msg, "USED") ||
			strings.Contains(msg, "SAME TYPE EXCHANGE") ||
			strings.Contains(msg, "CDK NOT FOUND") ||
			strings.Contains(msg, "TIME EXPIRED") ||
			strings.Contains(msg, "LIMIT") ||
			strings.Contains(msg, "RECEIVED") { // Handles "Already Received"

			p.Store.MarkAsRedeemed(fid, code)
			return -1, msg, nickname
		}

		// Temporary Failures (Retry)
		if msg == "CAPTCHA CHECK ERROR." {
			continue
		}

		if msg == "CAPTCHA CHECK TOO FREQUENT." || msg == "CAPTCHA GET TOO FREQUENT." {
			time.Sleep(5 * time.Second)
			continue
		}
	}

	return -2, "Retries Exhausted", nickname
}
