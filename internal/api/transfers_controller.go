package api

import (
	"fmt"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/services"
	"gift-redeemer/internal/utils"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type TransfersController struct {
	store     *db.Store
	cfg       *config.Config
	client    *client.PlayerClient
	sseBroker *services.SSEBroker
}

func NewTransfersController(s *db.Store, c *config.Config, client *client.PlayerClient, sseBroker *services.SSEBroker) *TransfersController {
	return &TransfersController{
		store:     s,
		cfg:       c,
		client:    client,
		sseBroker: sseBroker,
	}
}

func (tc *TransfersController) GetActiveSeason(c *gin.Context) {
	season, err := tc.store.GetActiveTransferSeason()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if season == nil {
		c.JSON(http.StatusOK, gin.H{"season": nil, "records": []db.TransferRecord{}})
		return
	}

	records, err := tc.store.GetTransferRecords(season.ID)
	if err != nil {
		fmt.Println("Error fetching transfer records:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch records"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"season": season, "records": records})
}

func (tc *TransfersController) CreateTransferSeason(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	var req struct {
		Name     string `json:"name"`
		PowerCap int64  `json:"powerCap"`
		Leading  bool   `json:"leading"`
		Specials int    `json:"specials"`
		Normals  int    `json:"normals"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := tc.store.CreateTransferSeason(req.Name, req.PowerCap, req.Leading, req.Specials, req.Normals); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create season"})
		return
	}
	logAction(c, tc.store, "TRANSFERS", "Created new transfer season: "+req.Name)
	c.JSON(http.StatusOK, gin.H{"message": "Season created"})
}

func (tc *TransfersController) AddPlayersForTransfer(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	var req struct {
		SeasonID     int    `json:"seasonId"`
		FID          int64  `json:"fid"`
		Nickname     string `json:"nickname"`
		FurnaceLevel int    `json:"furnaceLevel"`
		SourceState  string `json:"sourceState"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	nick, isEmpty := utils.SanitizeNickname(req.Nickname)
	if isEmpty {
		nick = "Unknown"
	}

	record := db.TransferRecord{
		SeasonID:     req.SeasonID,
		FID:          req.FID,
		Nickname:     nick,
		FurnaceLevel: req.FurnaceLevel,
		SourceState:  req.SourceState,
		// Provide a fallback avatar since we can't fetch it dynamically anymore
		Avatar: "https://gom-s3-user-avatar.s3.us-west-2.amazonaws.com/wp-content/uploads/2023/05/jeronimo.png",
		// Construct the furnace image dynamically based on the input level
		FurnaceImage: fmt.Sprintf("https://gof-formal-avatar.akamaized.net/img/icon/stove_lv_%d.png", req.FurnaceLevel),
	}

	if err := tc.store.AddTransferRecord(record); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add player"})
		return
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Added candidate: %s (FID: %d)", nick, req.FID))
	tc.sseBroker.Notifier <- "REFRESH_TRANSFERS"
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Successfully added %s", nick)})
}

func (tc *TransfersController) UpdateTransferRecord(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		Power            int64  `json:"power"`
		TargetAllianceID *int   `json:"targetAllianceId"`
		InviteType       string `json:"inviteType"`
		Status           string `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid data format received"})
		return
	}

	tc.store.UpdateTransferRecord(id, req.Power, req.TargetAllianceID, req.InviteType, req.Status)
	tc.sseBroker.Notifier <- "REFRESH_TRANSFERS"
	c.JSON(http.StatusOK, gin.H{"message": "Updated successfully"})
}

func (tc *TransfersController) ConfirmTransfer(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		FID              int64  `json:"fid"`
		Nickname         string `json:"nickname"`
		TargetAllianceID int    `json:"targetAllianceId"`
		Power            int64  `json:"power"`
	}
	_ = c.ShouldBindJSON(&req)

	if err := tc.store.ConfirmInboundTransfer(id, req.FID, req.Nickname, req.TargetAllianceID, req.Power); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction failed"})
		return
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Confirmed Inbound: %s", req.Nickname))
	tc.sseBroker.Notifier <- "REFRESH_TRANSFERS"
	c.JSON(http.StatusOK, gin.H{"message": "Player confirmed and added to Roster!"})
}

func (tc *TransfersController) UpdateSeasonStatus(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Status string `json:"status"`
	}
	_ = c.ShouldBindJSON(&req)

	tc.store.UpdateSeasonStatus(id, req.Status)
	tc.sseBroker.Notifier <- "REFRESH_TRANSFERS"
	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}

func (tc *TransfersController) GetTransferHistory(c *gin.Context) {
	seasons, err := tc.store.GetClosedTransferSeasons()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, seasons)
}

func (tc *TransfersController) GetTransferRecords(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	records, err := tc.store.GetTransferRecords(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch records"})
		return
	}
	c.JSON(http.StatusOK, records)
}

func (tc *TransfersController) ConfirmOutbandTransfer(c *gin.Context) {
	fid, _ := strconv.ParseInt(c.Param("fid"), 10, 64)

	var req struct {
		SeasonID  int    `json:"seasonId"`
		Nickname  string `json:"nickname"`
		DestState string `json:"destState"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	userRole := c.GetString("role")
	if userRole != "admin" {
		userAllianceID := c.GetInt("allianceId")
		playerAllianceID, err := tc.store.GetPlayerAllianceID(fid)

		if err != nil || playerAllianceID != userAllianceID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only transfer out members of your own alliance."})
			return
		}
	}

	if err := tc.store.ConfirmOutboundTransfer(fid, req.SeasonID, req.Nickname, req.DestState); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to archive player"})
		return
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Transferred Out: %s to %s", req.Nickname, req.DestState))
	c.JSON(http.StatusOK, gin.H{"message": "Player successfully archived and logged in transfer history."})
}

func (tc *TransfersController) EditTransferSeason(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		PowerCap int64 `json:"powerCap"`
		Specials int   `json:"specials"`
		Normals  int   `json:"normals"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input format"})
		return
	}

	if err := tc.store.UpdateTransferSeasonParams(id, req.PowerCap, req.Specials, req.Normals); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update season parameters"})
		return
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Updated season ID %d (Power Cap: %d, Specials: %d)", id, req.PowerCap, req.Specials))
	c.JSON(http.StatusOK, gin.H{"message": "Season parameters updated"})
}
