package api

import (
	"fmt"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/processor"
	"gift-redeemer/internal/services"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type WarController struct {
	store     *db.Store
	cfg       *config.Config
	engine    *processor.Processor
	sseBroker *services.SSEBroker
}

func NewWarController(s *db.Store, c *config.Config, e *processor.Processor, b *services.SSEBroker) *WarController {
	return &WarController{
		store:     s,
		cfg:       c,
		engine:    e,
		sseBroker: b,
	}
}

func (wc *WarController) AddPlayer(c *gin.Context) {
	var input struct {
		Players string `json:"players" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format. Send { \"players\": \"123, 456\" }"})
		return
	}

	rawIDs := strings.Split(input.Players, ",")
	var ids []int64

	for _, raw := range rawIDs {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		if id, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
			ids = append(ids, id)
		}
	}

	if len(ids) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid numeric IDs found"})
		return
	}

	added, skipped, err := wc.store.AddPlayers(ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	wc.sseBroker.Notifier <- "REFRESH_ROSTER"
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Processed %d IDs", len(ids)),
		"added":   added,
		"skipped": skipped,
	})
}

func (wc *WarController) DeletePlayer(c *gin.Context) {
	fid, err := strconv.ParseInt(c.Param("fid"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid Player ID"})
		return
	}

	if err := wc.store.DeletePlayer(fid); err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete player from database"})
		return
	}

	wc.sseBroker.Notifier <- "REFRESH_ROSTER"
	c.JSON(200, gin.H{"message": "Player removed from roster"})
}

func (wc *WarController) GetWarStats(c *gin.Context) {
	stats, err := wc.store.GetWarStats()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to load stats"})
		return
	}
	c.JSON(200, stats)
}

func (wc *WarController) DeployToWarRoom(c *gin.Context) {
	var input struct {
		PlayerIDs  []int64 `json:"playerIds" binding:"required"`
		AllianceID *int    `json:"allianceId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	err := wc.store.BulkAssignFightingAlliance(input.PlayerIDs, input.AllianceID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Deployment failed"})
		return
	}
	c.JSON(200, gin.H{"message": "Troops deployed successfully"})
}

func (wc *WarController) LockWarRoom(c *gin.Context) {
	var input struct {
		AllianceID int  `json:"allianceId"`
		IsLocked   bool `json:"isLocked"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	err := wc.store.ToggleAllianceLock(input.AllianceID, input.IsLocked)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to toggle lock"})
		return
	}
	wc.sseBroker.Notifier <- "REFRESH_WARROOM"
	c.JSON(200, gin.H{"message": "Lock updated"})
}

func (wc *WarController) ArchiveAndResetEvent(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only Admins can reset the event"})
		return
	}

	var input struct {
		Notes string `json:"notes"`
	}
	_ = c.ShouldBindJSON(&input)

	adminUsername := c.GetString("username")

	if err := wc.store.ArchiveAndResetEvent(adminUsername, input.Notes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Archive and Reset failed"})
		return
	}

	wc.sseBroker.Notifier <- "REFRESH_WARROOM"
	c.JSON(http.StatusOK, gin.H{"message": "Event archived and reset! All troops returned to reserve."})
}

func (wc *WarController) GetEventHistory(c *gin.Context) {
	events, err := wc.store.GetEventHistoryList()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history list"})
		return
	}
	if events == nil {
		events = []db.EventSnapshot{}
	}
	c.JSON(http.StatusOK, events)
}

func (wc *WarController) GetPastEvent(c *gin.Context) {
	eventIDStr := c.Param("id")
	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	teams, players, err := wc.store.GetEventSnapshotDetails(eventID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch snapshot details"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"teams":   teams,
		"players": players,
	})
}

func (wc *WarController) GetSquads(c *gin.Context) {
	aid, _ := strconv.Atoi(c.Param("allianceId"))
	squads, err := wc.store.GetSquads(aid)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to load squads"})
		return
	}
	c.JSON(200, squads)
}

func (wc *WarController) PromoteCaptain(c *gin.Context) {
	var input struct {
		FID        int64 `json:"fid"`
		AllianceID int   `json:"allianceId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}
	wc.store.PromoteCaptain(input.FID, input.AllianceID)

	wc.sseBroker.Notifier <- "REFRESH_SQUADS"
	c.JSON(200, gin.H{"message": "Squad created"})
}

func (wc *WarController) DemoteCaptain(c *gin.Context) {
	var input struct {
		TeamID int `json:"teamId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}
	wc.store.DemoteCaptain(input.TeamID)

	wc.sseBroker.Notifier <- "REFRESH_SQUADS"
	c.JSON(200, gin.H{"message": "Squad disbanded"})
}

func (wc *WarController) AssignPlayerToSquad(c *gin.Context) {
	var input struct {
		FID    int64 `json:"fid"`
		TeamID *int  `json:"teamId"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}
	wc.store.AssignToSquad(input.FID, input.TeamID)

	wc.sseBroker.Notifier <- "REFRESH_SQUADS"
	c.JSON(200, gin.H{"message": "Player moved"})
}

func (wc *WarController) GetPlayerRoster(c *gin.Context) {
	username := c.GetString("username")
	user, _ := wc.store.GetUserByUsername(username)

	var players []db.PlayerRow
	var err error

	if user.Role == "admin" {
		players, err = wc.store.GetPlayers(nil)
	} else {
		if user.AllianceID == nil {
			players = []db.PlayerRow{}
		} else {
			players, err = wc.store.GetPlayers(user.AllianceID)
		}
	}

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch roster"})
		return
	}
	if players == nil {
		players = []db.PlayerRow{}
	}
	c.JSON(200, players)
}

func (wc *WarController) UpdatePlayer(c *gin.Context) {
	fid, _ := strconv.ParseInt(c.Param("fid"), 10, 64)

	var input struct {
		Power              int64  `json:"power"`
		NormalPower        int64  `json:"normalPower"`
		TroopType          string `json:"troopType"`
		BattleAvailability string `json:"battleAvailability"`
		Avail0200          bool   `json:"avail_0200"`
		Avail1200          bool   `json:"avail_1200"`
		Avail1400          bool   `json:"avail_1400"`
		Avail1900          bool   `json:"avail_1900"`
		AllianceID         *int   `json:"allianceId"`
		FightingAllianceID *int   `json:"fightingAllianceId"`
		TeamID             *int   `json:"teamId"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	err := wc.store.UpdatePlayerDetails(
		fid,
		input.Power,
		input.NormalPower,
		input.TroopType,
		input.BattleAvailability,
		input.Avail0200,
		input.Avail1200,
		input.Avail1400,
		input.Avail1900,
		input.AllianceID,
		input.FightingAllianceID,
		input.TeamID,
	)

	if err != nil {
		c.JSON(500, gin.H{"error": "Update failed"})
		return
	}
	c.JSON(200, gin.H{"message": "Player updated"})
}

func (wc *WarController) GetWarRoomFilter(c *gin.Context) {
	opts, err := wc.store.GetWarRoomFilterOptions()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch filter options"})
		return
	}
	c.JSON(200, opts)
}

func (wc *WarController) SyncRoster(c *gin.Context) {
	playerIDs, err := wc.store.GetAllPlayerIDs()
	if err != nil {
		fmt.Printf("Error fetching IDs: %v\n", err)
		c.JSON(500, gin.H{"error": "Failed to fetch player list"})
		return
	}

	if len(playerIDs) == 0 {
		c.JSON(200, gin.H{"message": "Roster is empty, nothing to sync."})
		return
	}

	go func(ids []int64) {
		fmt.Printf("[SYNC] Starting roster refresh for %d players...\n", len(ids))

		for i, fid := range ids {
			info, err := wc.engine.PlayerClient.GetPlayerInfo(fid)

			if err == nil && info.Code == 0 {
				wc.store.UpsertPlayer(
					info.Data.Fid,
					info.Data.Nickname,
					info.Data.KID,
					info.Data.StoveLv,
					string(info.Data.StoveImg),
					info.Data.Avatar,
				)
				fmt.Printf("[SYNC] Updated %d/%d: %s\n", i+1, len(ids), info.Data.Nickname)
			} else {
				fmt.Printf("[SYNC] Failed to update FID %d\n", fid)
			}

			time.Sleep(1500 * time.Millisecond)
		}
		fmt.Println("[SYNC] Roster refresh complete.")
	}(playerIDs)

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("Started background update for %d players. This will take about %d seconds.",
			len(playerIDs), len(playerIDs)/2),
	})
}
