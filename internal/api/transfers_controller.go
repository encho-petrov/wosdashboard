package api

import (
	"fmt"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type TransfersController struct {
	store  *db.Store
	cfg    *config.Config
	client *client.PlayerClient
}

func NewTransfersController(s *db.Store, c *config.Config, client *client.PlayerClient) *TransfersController {
	return &TransfersController{
		store:  s,
		cfg:    c,
		client: client,
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

	records, _ := tc.store.GetTransferRecords(season.ID)
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
		SeasonID int    `json:"seasonId"`
		FIDs     string `json:"fids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	addedCount := 0
	fidList := strings.Split(req.FIDs, ",")

	for _, fidStr := range fidList {
		fidStr = strings.TrimSpace(fidStr)
		if fidStr == "" {
			continue
		}
		fidNum, err := strconv.ParseInt(fidStr, 10, 64)
		if err != nil {
			continue
		}

		info, err := tc.client.GetPlayerInfo(fidNum)
		if err != nil || info == nil || info.Data.Nickname == "" {
			continue
		}

		record := db.TransferRecord{
			SeasonID:     req.SeasonID,
			FID:          fidNum,
			Nickname:     info.Data.Nickname,
			FurnaceLevel: info.Data.StoveLv,
			SourceState:  fmt.Sprintf("State %d", info.Data.KID),
			Avatar:       info.Data.Avatar,
			FurnaceImage: string(info.Data.StoveImg),
		}

		if err := tc.store.AddTransferRecord(record); err == nil {
			addedCount++
		}
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Bulk added %d candidates", addedCount))
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Successfully added %d candidates", addedCount)})
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
	}
	_ = c.ShouldBindJSON(&req)

	if err := tc.store.ConfirmInboundTransfer(id, req.FID, req.Nickname, req.TargetAllianceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction failed"})
		return
	}

	logAction(c, tc.store, "TRANSFERS", fmt.Sprintf("Confirmed Inbound: %s", req.Nickname))
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
