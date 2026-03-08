package api

import (
	"fmt"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type MinistryController struct {
	store *db.Store
	cfg   *config.Config
}

func NewMinistryController(s *db.Store, c *config.Config) *MinistryController {
	return &MinistryController{
		store: s,
		cfg:   c,
	}
}

func (mc *MinistryController) GetActiveEvent(c *gin.Context) {
	event, err := mc.store.GetActiveMinistryEvent()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if event == nil {
		c.JSON(http.StatusOK, gin.H{"event": nil})
		return
	}

	days, _ := mc.store.GetMinistryDays(event.ID)

	type DayWithSlots struct {
		db.MinistryDay
		Slots []db.MinistrySlot `json:"slots"`
	}

	var schedule []DayWithSlots
	for _, d := range days {
		slots, _ := mc.store.GetMinistrySlots(d.ID)
		schedule = append(schedule, DayWithSlots{MinistryDay: d, Slots: slots})
	}

	c.JSON(http.StatusOK, gin.H{"event": event, "schedule": schedule})
}

func (mc *MinistryController) CreateEvent(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	var req struct {
		Title           string           `json:"title"`
		AnnounceEnabled bool             `json:"announceEnabled"`
		Days            []db.MinistryDay `json:"days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := mc.store.CreateMinistryEvent(req.Title, req.AnnounceEnabled, req.Days); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate schedule"})
		return
	}

	logAction(c, mc.store, "MINISTRY", "Created new Ministry Event: "+req.Title)
	c.JSON(http.StatusOK, gin.H{"message": "Event created and slots generated!"})
}

func (mc *MinistryController) UpdateActiveEvent(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Status string `json:"status"`
	}
	_ = c.ShouldBindJSON(&req)

	mc.store.UpdateMinistryStatus(id, req.Status)
	actionDetail := fmt.Sprintf("Changed Ministry Event %d status to %s", id, req.Status)
	if req.Status == "Closed" {
		actionDetail = "Archived Ministry Event #" + strconv.Itoa(id)
	}
	logAction(c, mc.store, "MINISTRY", actionDetail)

	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}

func (mc *MinistryController) UpdateMinistrySlot(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		PlayerFID *int64 `json:"playerFid"`
		Nickname  string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if err := mc.store.UpdateMinistrySlot(id, req.PlayerFID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update slot"})
		return
	}

	actionMsg := "Cleared a ministry slot"
	if req.PlayerFID != nil {
		actionMsg = fmt.Sprintf("Assigned %s to a ministry slot", req.Nickname)
	}
	logAction(c, mc.store, "MINISTRY", actionMsg)

	c.JSON(http.StatusOK, gin.H{"message": "Slot updated"})
}

func (mc *MinistryController) ToggleNotifications(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		AnnounceEnabled bool `json:"announceEnabled"`
	}
	_ = c.ShouldBindJSON(&req)

	mc.store.UpdateMinistryAnnounce(id, req.AnnounceEnabled)
	logAction(c, mc.store, "MINISTRY", fmt.Sprintf("Toggled Discord Pings to %v", req.AnnounceEnabled))
	c.JSON(http.StatusOK, gin.H{"message": "Announcements toggled"})
}

func (mc *MinistryController) GetHistory(c *gin.Context) {
	events, err := mc.store.GetClosedMinistryEvents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, events)
}

func (mc *MinistryController) GetHistorySlots(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	days, err := mc.store.GetMinistryDays(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history days"})
		return
	}

	type DayWithSlots struct {
		db.MinistryDay
		Slots []db.MinistrySlot `json:"slots"`
	}

	var schedule []DayWithSlots
	for _, d := range days {
		slots, _ := mc.store.GetMinistrySlots(d.ID)
		schedule = append(schedule, DayWithSlots{MinistryDay: d, Slots: slots})
	}

	c.JSON(http.StatusOK, schedule)
}
