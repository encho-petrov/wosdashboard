package api

import (
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type PlayerController struct {
	store *db.Store
	cfg   *config.Config
}

func NewPlayerController(store *db.Store, cfg *config.Config) *PlayerController {
	return &PlayerController{
		store: store,
		cfg:   cfg,
	}
}

func (pc *PlayerController) GetPlayerInfo(c *gin.Context) {
	if c.GetString("role") != "player" {
		c.JSON(403, gin.H{"error": "Player access only"})
		return
	}

	fidStr := c.GetString("username")
	fid, _ := strconv.ParseInt(fidStr, 10, 64)

	profile, err := pc.store.GetPlayerProfile(fid)
	if err != nil {
		c.JSON(404, gin.H{"error": "Profile not found"})
		return
	}

	c.JSON(200, profile)
}

func (pc *PlayerController) GetPlayerDashboard(c *gin.Context) {
	fidStr := c.GetString("username")

	fid, err := strconv.ParseInt(fidStr, 10, 64)
	if err != nil {
		c.JSON(401, gin.H{"error": "Invalid token identity"})
		return
	}

	data, err := pc.store.GetPlayerDashboardData(fid)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to load dashboard"})
		return
	}

	ministries, _ := pc.store.GetPlayerMinistrySlots(fid)
	if ministries == nil {
		ministries = make([]db.PlayerMinistrySlot, 0)
	}

	liveSeason, liveWeek := services.GetRotationState(pc.cfg.Rotation.SeasonReferenceDate, pc.cfg.Rotation.AnchorSeason)
	forts := make([]db.RotationEntryExtended, 0)

	if data.Player.AllianceID != nil {
		res, _ := pc.store.GetAllianceRotationForWeek(liveSeason, liveWeek, *data.Player.AllianceID)
		if res != nil {
			forts = res
		}
	}

	c.JSON(200, gin.H{
		"player":     data.Player,
		"teammates":  data.Teammates,
		"ministries": ministries,
		"forts":      forts,
	})
}
