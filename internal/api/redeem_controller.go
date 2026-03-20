package api

import (
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/processor"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type RedeemController struct {
	store      *db.Store
	cfg        *config.Config
	client     *client.PlayerClient
	redisStore *cache.RedisStore
	engine     *processor.Processor
}

func NewRedeemController(s *db.Store, c *config.Config, p *client.PlayerClient, r *cache.RedisStore, e *processor.Processor) *RedeemController {
	return &RedeemController{
		store:      s,
		cfg:        c,
		client:     p,
		redisStore: r,
		engine:     e,
	}
}

func (rc *RedeemController) GetBalance(c *gin.Context) {
	url := fmt.Sprintf("https://2captcha.com/res.php?key=%s&action=getbalance&json=1", rc.cfg.ApiSecrets.CaptchaApiKey)

	resp, err := http.Get(url)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to 2captcha"})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Status  int    `json:"status"`
		Request string `json:"request"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse 2captcha response"})
		return
	}

	if result.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": result.Request})
		return
	}

	c.JSON(http.StatusOK, gin.H{"balance": result.Request})
}

func (rc *RedeemController) Redeem(c *gin.Context) {
	var input struct {
		GiftCodes []string `json:"giftCodes" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}

	if rc.engine.IsJobRunning() {
		c.JSON(409, gin.H{"error": "A job is already running"})
		return
	}

	user, _ := rc.store.GetUserByUsername(c.GetString("username"))

	players, _ := rc.store.GetPlayers(nil)

	var targets []models.PlayerData
	for _, p := range players {
		targets = append(targets, models.PlayerData{Fid: p.FID, Nickname: p.Nickname})
	}

	jobID, err := rc.engine.StartJob(input.GiftCodes, targets, int64(user.ID))
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to start redemption job"})
		return
	}
	details := fmt.Sprintf("Started redemption job with codes: %v", input.GiftCodes)
	logAction(c, rc.store, "START_REDEMPTION", details)

	c.JSON(200, gin.H{"message": "Job Started", "jobId": jobID})
}

func (rc *RedeemController) GetRecentJobs(c *gin.Context) {
	jobs, err := rc.store.GetRecentJobs()
	if err != nil {
		fmt.Printf("DB Error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch jobs"})
		return
	}

	if jobs == nil {
		jobs = []db.JobResponse{}
	}
	c.JSON(http.StatusOK, jobs)
}

func (rc *RedeemController) GetActiveJob(c *gin.Context) {
	progress := rc.engine.Redis.GetCurrentJobStatus()

	isRunning := true
	if progress != nil {
		if progress.Status == "COMPLETED" || progress.Status == "FAILED" {
			isRunning = false
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"active": isRunning,
		"data":   progress,
	})
}

func (rc *RedeemController) DownloadReport(c *gin.Context) {
	filename := c.Param("filename")

	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	targetPath := filepath.Join("reports", filename)

	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "text/csv")
	c.File(targetPath)
}
