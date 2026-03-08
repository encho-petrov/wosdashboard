package api

import (
	"fmt"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type FortressController struct {
	store *db.Store
	cfg   *config.Config
}

func NewFortressController(s *db.Store, c *config.Config) *FortressController {
	return &FortressController{
		store: s,
		cfg:   c,
	}
}

func (fc *FortressController) GetAllBuildings(c *gin.Context) {
	buildings, err := fc.store.GetAllBuildings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch buildings"})
		return
	}
	c.JSON(http.StatusOK, buildings)
}

func (fc *FortressController) GetSeasonSchedule(c *gin.Context) {
	seasonId, _ := strconv.Atoi(c.Param("seasonId"))
	schedule, err := fc.store.GetSeasonSchedule(seasonId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch schedule"})
		return
	}
	c.JSON(http.StatusOK, schedule)
}

func (fc *FortressController) GetWeeklyRewards(c *gin.Context) {
	week, _ := strconv.Atoi(c.Param("week"))
	rewards, err := fc.store.GetWeeklyRewards(week)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rewards"})
		return
	}
	c.JSON(http.StatusOK, rewards)
}

func (fc *FortressController) UpdateSeason(c *gin.Context) {
	var req struct {
		SeasonID int                `json:"seasonId"`
		Entries  []db.RotationEntry `json:"entries"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	if err := fc.store.SaveSeasonRotation(req.SeasonID, req.Entries); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	logAction(c, fc.store, "UPDATE_ROTATION", fmt.Sprintf("Updated rotation for Season %d", req.SeasonID))
	c.JSON(http.StatusOK, gin.H{"message": "Rotation schedule updated successfully"})
}

func (fc *FortressController) GetSeasonHistory(c *gin.Context) {
	liveSeason, _ := services.GetRotationState(
		fc.cfg.Rotation.SeasonReferenceDate,
		fc.cfg.Rotation.AnchorSeason,
	)

	existingSeasons, err := fc.store.GetRotationHistory()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}

	foundLive := false
	for _, s := range existingSeasons {
		if s == liveSeason {
			foundLive = true
			break
		}
	}
	if !foundLive {
		existingSeasons = append(existingSeasons, liveSeason)
	}

	c.JSON(http.StatusOK, gin.H{
		"liveSeason":       liveSeason,
		"availableSeasons": existingSeasons,
	})
}
