package api

import (
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

type StrategyController struct {
	store      *db.Store
	cfg        *config.Config
	redisStore *cache.RedisStore
}

func NewStrategyController(s *db.Store, c *config.Config, r *cache.RedisStore) *StrategyController {
	return &StrategyController{
		store:      s,
		cfg:        c,
		redisStore: r,
	}
}

func (sc *StrategyController) GetHeroes(c *gin.Context) {
	heroes, err := sc.store.GetHeroes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch heroes"})
		return
	}
	c.JSON(http.StatusOK, heroes)
}

func (sc *StrategyController) SaveStrategy(c *gin.Context) {
	var req models.BattleMetaRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format: " + err.Error()})
		return
	}

	strategyID, err := sc.store.SaveBattleStrategy(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save strategy"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Strategy updated successfully", "id": strategyID})
}

func (sc *StrategyController) GetActiveStrategy(c *gin.Context) {
	activeMeta, err := sc.store.GetActiveStrategy()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch active strategy"})
		return
	}

	c.JSON(http.StatusOK, activeMeta)
}

func (sc *StrategyController) GetCaptains(c *gin.Context) {
	captainList, err := sc.store.GetActiveCaptains()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch active captains"})
		return
	}

	c.JSON(http.StatusOK, captainList)
}

func (sc *StrategyController) GetPetSchedule(c *gin.Context) {
	dateParam := c.Query("date")

	if dateParam == "" {
		upcomingDate, err := sc.store.GetUpcomingPetScheduleDate()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check upcoming schedules"})
			return
		}

		if upcomingDate == "" {
			c.JSON(http.StatusOK, gin.H{
				"date":     "",
				"schedule": map[string][]int64{"1": {}, "2": {}, "3": {}},
			})
			return
		}

		dateParam = upcomingDate
	}

	schedule, err := sc.store.GetPetScheduleByDate(dateParam)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"date":     dateParam,
		"schedule": schedule,
	})
}

func (sc *StrategyController) SavePetSchedule(c *gin.Context) {
	var req db.PetScheduleRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload: " + err.Error()})
		return
	}

	if err := sc.store.SavePetSchedule(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save pet schedule"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pet schedule saved successfully"})
}
