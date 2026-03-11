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

type FoundryController struct {
	store     *db.Store
	cfg       *config.Config
	sseBroker *services.SSEBroker
}

func NewFoundryController(s *db.Store, c *config.Config, b *services.SSEBroker) *FoundryController {
	return &FoundryController{
		store:     s,
		cfg:       c,
		sseBroker: b,
	}
}

func (fc *FoundryController) GetEventState(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Alliance required"})
		return
	}

	eventType := c.Query("eventType")
	if eventType == "" {
		eventType = "Foundry"
	}

	legions, roster, stats, err := fc.store.GetAllianceEventState(allianceID, eventType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load state"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"legions": legions, "roster": roster, "stats": stats})
}

func (fc *FoundryController) DeployPlayer(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Alliance required"})
		return
	}

	var req struct {
		EventType string `json:"eventType" binding:"required"`
		PlayerID  int64  `json:"playerId" binding:"required"`
		LegionID  *int   `json:"legionId"`
		IsSub     bool   `json:"isSub"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = fc.store.DeployAllianceEventPlayer(allianceID, req.EventType, req.PlayerID, req.LegionID, req.IsSub)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deploy"})
		return
	}

	fc.sseBroker.Notifier <- "REFRESH_FOUNDRY"
	c.JSON(http.StatusOK, gin.H{"message": "Deployed successfully"})
}

func (fc *FoundryController) LockEvent(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Alliance required"})
		return
	}

	var req struct {
		EventType string `json:"eventType" binding:"required"`
		LegionID  int    `json:"legionId" binding:"required"`
		IsLocked  bool   `json:"isLocked"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = fc.store.ToggleAllianceEventLock(allianceID, req.EventType, req.LegionID, req.IsLocked)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to lock/unlock"})
		return
	}

	fc.sseBroker.Notifier <- "REFRESH_FOUNDRY"
	c.JSON(http.StatusOK, gin.H{"message": "Lock updated"})
}

func (fc *FoundryController) UpdateAttendance(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Alliance required"})
		return
	}

	var req struct {
		EventType  string `json:"eventType" binding:"required"`
		PlayerID   int64  `json:"playerId" binding:"required"`
		Attendance string `json:"attendance" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = fc.store.UpdateAllianceEventAttendance(allianceID, req.EventType, req.PlayerID, req.Attendance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update attendance"})
		return
	}

	fc.sseBroker.Notifier <- "REFRESH_FOUNDRY"
	c.JSON(http.StatusOK, gin.H{"message": "Attendance updated"})
}

func (fc *FoundryController) ResetAndArchiveEvent(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Alliance required"})
		return
	}

	var req struct {
		EventType string `json:"eventType" binding:"required"`
		Notes     string `json:"notes"`
	}
	_ = c.ShouldBindJSON(&req)

	adminUsername := c.GetString("username")

	err = fc.store.ArchiveAllianceEvent(allianceID, req.EventType, adminUsername, req.Notes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to archive"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Event archived and reset successfully"})
}

func (fc *FoundryController) GetEventHistory(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(403, gin.H{"error": "Alliance required"})
		return
	}

	eventType := c.Query("eventType")
	if eventType == "" {
		eventType = "Foundry"
	}

	list, err := fc.store.GetAllianceHistoryList(allianceID, eventType)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to load history list"})
		return
	}
	c.JSON(200, list)
}

func (fc *FoundryController) GetEventInHistory(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(403, gin.H{"error": "Alliance required"})
		return
	}

	historyID, _ := strconv.Atoi(c.Param("id"))
	players, err := fc.store.GetAllianceHistorySnapshot(historyID, allianceID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to load snapshot details"})
		return
	}

	c.JSON(200, players)
}

func (fc *FoundryController) AnnounceFoundry(c *gin.Context) {
	allianceID, err := getAllianceID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		EventName string `json:"eventName"`
		Message   string `json:"message"`
	}
	_ = c.ShouldBindJSON(&req)

	route, err := fc.store.GetRouteForEvent(&allianceID, "command_alerts")
	if err != nil || route == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Command Alerts channel is not configured for this alliance."})
		return
	}

	pingStr := services.FormatDiscordPing(route.PingRoleID)

	evtName := "Alliance Event"
	if req.EventName != "" {
		evtName = req.EventName
	}
	title := fmt.Sprintf("🛡️ %s Deployment Update", evtName)

	desc := fmt.Sprintf("The roster for the upcoming **%s** has been locked and finalized. Please check the portal for deployment details.", evtName)
	if req.Message != "" {
		desc = req.Message
	}

	err = services.SendCustomDiscordEmbed(fc.cfg.Discord.BotToken, route.ChannelID, title, desc, 15158332, pingStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send announcement to Discord"})
		return
	}

	logAction(c, fc.store, "DISCORD", fmt.Sprintf("Sent %s Announcement", evtName))
	c.JSON(http.StatusOK, gin.H{"message": "Announcement sent to Discord!"})
}
