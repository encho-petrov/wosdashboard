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

const WorkerCount = 2 // <--- THE STAGGERED DUO

var (
	isPaused   bool
	pauseMutex sync.RWMutex
	pauseUntil time.Time
	apiMutex   sync.Mutex // <--- GLOBAL API LOCK
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

// --- ROUTER API WRAPPERS ---

func (p *Processor) IsJobRunning() bool {
	return !p.Redis.AcquireJobLock("check_only")
}

func (p *Processor) GetStatus() (bool, *models.RedeemJob) {
	return len(p.JobQueue) > 0, nil
}

func (p *Processor) StartJob(codes []string, targets []models.PlayerData, initiatedBy int64) (string, error) {
	jobID, err := p.Store.CreateJob(initiatedBy, strings.Join(codes, ","), "PENDING", len(targets))
	if err != nil {
		return "", err
	}

	job := &models.RedeemJob{
		JobID:     jobID,
		GiftCodes: codes,
		UserID:    initiatedBy,
		Total:     len(targets),
		Status:    "PENDING",
		CreatedAt: time.Now(),
		Targets:   targets, // The list of players to process
	}
	p.JobQueue <- job
	return jobID, nil
}

// --- CIRCUIT BREAKER (WAF PROTECTION) ---

func triggerPause() {
	pauseMutex.Lock()
	defer pauseMutex.Unlock()
	if !isPaused {
		isPaused = true
		pauseUntil = time.Now().Add(60 * time.Second)
		log.Println("🚨 WAF_BLOCK Detected! Triggering 60-second Global Pause for all workers.")
	}
}

func checkPause() {
	pauseMutex.RLock()
	paused := isPaused
	until := pauseUntil
	pauseMutex.RUnlock()

	if paused {
		if time.Now().Before(until) {
			sleepDur := time.Until(until)
			log.Printf("Worker sleeping for %v to respect Global Pause...", sleepDur)
			time.Sleep(sleepDur)
		}
		// Time's up, lift the pause
		pauseMutex.Lock()
		if isPaused && time.Now().After(pauseUntil) {
			isPaused = false
			log.Println("✅ Global Pause lifted. Resuming operations safely.")
		}
		pauseMutex.Unlock()
	}
}

// --- API LOCK & JITTER ---

func (p *Processor) safeAPICall(call func() error) error {
	checkPause() // Wait if globally paused

	apiMutex.Lock() // Grab the global API lock
	defer apiMutex.Unlock()

	err := call()

	// JITTER: Wait randomly between 1.0 and 2.5 seconds before releasing lock
	jitter := time.Duration(1000+rand.Intn(1500)) * time.Millisecond
	time.Sleep(jitter)

	return err
}

// --- WORKER ENGINE ---

func (p *Processor) StartWorkers() {
	for i := 1; i <= WorkerCount; i++ {
		go p.worker(i)
	}
}

func (p *Processor) worker(id int) {
	for job := range p.JobQueue {
		p.processJob(job, id)
	}
}

func (p *Processor) processJob(job *models.RedeemJob, workerID int) {
	log.Printf("[Worker %d] Starting Job %s", workerID, job.JobID)
	p.Redis.AcquireJobLock(job.JobID)
	defer p.Redis.ReleaseJobLock()

	p.Store.UpdateJobProgress(job.JobID, 0)
	var reportEntries []models.RedeemJobEntry
	processedCount := 0

	for _, target := range job.Targets {
		for _, code := range job.GiftCodes {
			status, msg, updatedNick := p.redeemForPlayer(target.Fid, target.Nickname, code)

			reportEntries = append(reportEntries, models.RedeemJobEntry{
				PlayerId:     target.Fid,
				Nickname:     updatedNick,
				GiftCode:     code,
				RedeemStatus: status,
				RedeemMsg:    msg,
			})
		}

		processedCount++
		p.Store.UpdateJobProgress(job.JobID, processedCount)
		p.Redis.SetJobProgress(job.JobID, processedCount, job.Total, "RUNNING")
	}

	reportPath, err := reports.ExportJobResults(job, reportEntries)
	if err == nil {
		p.Store.CompleteJob(job.JobID, "COMPLETED", reportPath)
	}
}

func (p *Processor) redeemForPlayer(fid int64, nickname, code string) (int, string, string) {
	attempt := 1
	maxAttempts := 3
	fidStr := fmt.Sprintf("%d", fid)

	for attempt <= maxAttempts {
		checkPause()

		// 1. Player Login (Uses API Lock)
		var loginErr error
		p.safeAPICall(func() error {
			// WE CHANGE THIS LINE
			_, loginErr = p.PlayerClient.GetPlayerInfo(fid)
			return loginErr
		})

		if loginErr != nil {
			if strings.Contains(loginErr.Error(), "WAF_BLOCK") {
				triggerPause()
				continue // WAF Blocks do not consume an attempt
			}
			log.Printf("[FID %d] Login Error (Attempt %d): %v", fid, attempt, loginErr)
			attempt++
			continue
		}

		// 2. Fetch Captcha (Uses API Lock)
		var imgBase64 string
		var fetchErr error
		p.safeAPICall(func() error {
			imgBase64, fetchErr = p.PlayerClient.GetCaptcha(fid)
			return fetchErr
		})

		if fetchErr != nil {
			if strings.Contains(fetchErr.Error(), "WAF_BLOCK") {
				triggerPause()
				continue
			}
			log.Printf("[FID %d] Captcha Error (Attempt %d): %v", fid, attempt, fetchErr)
			attempt++
			continue
		}

		// 3. Solve Captcha (NO API Lock needed! Solves concurrently with 2Captcha)
		solved, err := p.Solver.Solve(imgBase64)
		if err != nil {
			log.Printf("[FID %d] Solver Error: %v", fid, err)
			attempt++
			continue
		}

		// 4. Redeem Gift (Uses API Lock)
		var errCode int
		var msg, redeemNickname string
		var redeemErr error

		p.safeAPICall(func() error {
			errCode, msg, redeemNickname, redeemErr = p.GiftClient.RedeemGift(fidStr, code, solved)
			return redeemErr
		})

		if redeemNickname != "" {
			nickname = redeemNickname
		}

		if redeemErr != nil {
			if strings.Contains(redeemErr.Error(), "WAF_BLOCK") {
				triggerPause()
				continue
			}
			log.Printf("[FID %d] Redeem Timeout/Error (Attempt %d): %v", fid, attempt, redeemErr)
			attempt++
			continue
		}

		// 5. Handle Success
		if errCode == 20000 || errCode == 0 || msg == "SUCCESS" {
			p.Store.MarkAsRedeemed(fid, code)
			return 1, "Success", nickname
		}

		// 6. Ghost Redemption Fix (Context-Aware Check)
		isGhostSuccess := strings.Contains(msg, "USED") || strings.Contains(msg, "SAME TYPE EXCHANGE")
		if isGhostSuccess && attempt > 1 {
			log.Printf("[FID %d] 👻 Ghost Redemption Detected on Attempt %d. Marking as Success.", fid, attempt)
			p.Store.MarkAsRedeemed(fid, code)
			return 1, "Success (Recovered)", nickname
		}

		// 7. Permanent Failures
		if isGhostSuccess ||
			strings.Contains(msg, "CDK NOT FOUND") ||
			strings.Contains(msg, "TIME EXPIRED") ||
			strings.Contains(msg, "NOT MEET CONDITIONS") ||
			strings.Contains(msg, "NOT IN THE REDEMPTION") {
			return errCode, msg, nickname
		}

		log.Printf("[FID %d] Attempt %d Failed: %s", fid, attempt, msg)
		attempt++
	}

	return -1, "Max Retries Reached", nickname
}
