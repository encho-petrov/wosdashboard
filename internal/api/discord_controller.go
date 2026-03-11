package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/services"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type DiscordController struct {
	store       *db.Store
	cfg         *config.Config
	cronManager *services.CronManager
	redisStore  *cache.RedisStore
	sseBroker   *services.SSEBroker
}

type DiscordChannel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type int    `json:"type"`
}

type DiscordRole struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Managed bool   `json:"managed"`
}

var actionType = "static_button"
var remainingStr = "a few"
var limit = int64(1)
var cooldown = 30 * time.Second

func NewDiscordController(store *db.Store, cfg *config.Config, cronManager *services.CronManager, redisStore *cache.RedisStore, sseBroker *services.SSEBroker) *DiscordController {
	return &DiscordController{store: store, cfg: cfg, cronManager: cronManager, redisStore: redisStore, sseBroker: sseBroker}
}

func (dc *DiscordController) resolveTargetAlliance(c *gin.Context) (*int, error) {
	username := c.GetString("username")
	role := c.GetString("role")
	scope := c.Query("scope")

	user, err := dc.store.GetUserByUsername(username)
	if err != nil {
		return nil, err
	}

	if role == "admin" && scope == "state" {
		return nil, nil
	}

	return user.AllianceID, nil
}

func (dc *DiscordController) LoginHandler(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
		return
	}

	stateToken, err := auth.GenerateDiscordState(allianceID, dc.cfg.ApiSecrets.JwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate security state"})
		return
	}

	discordURL := fmt.Sprintf(
		"https://discord.com/oauth2/authorize?client_id=%s&permissions=2147483648&scope=bot&response_type=code&redirect_uri=%s&state=%s",
		dc.cfg.Discord.ClientID,
		url.QueryEscape(dc.cfg.Discord.RedirectURI),
		stateToken,
	)

	c.JSON(http.StatusOK, gin.H{"url": discordURL})
}

func (dc *DiscordController) CallbackHandler(c *gin.Context) {
	state := c.Query("state")
	guildID := c.Query("guild_id")
	frontendURL := dc.cfg.BioID.ApplicationURL

	if state == "" || guildID == "" {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/discord?error=missing_parameters")
		return
	}

	claims, err := auth.ValidateDiscordState(state, dc.cfg.ApiSecrets.JwtSecret)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/discord?error=invalid_state")
		return
	}

	guildName := "Unknown Server"
	req, _ := http.NewRequest("GET", "https://discord.com/api/v10/guilds/"+guildID, nil)
	req.Header.Set("Authorization", "Bot "+dc.cfg.Discord.BotToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			var guildData struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&guildData); err == nil {
				guildName = guildData.Name
			}
		}
	}

	err = dc.store.UpsertDiscordGuild(guildID, guildName, claims.AllianceID)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/discord?error=database_error")
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_DISCORD_CONFIG"
	c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/discord?success=true")
}

func (dc *DiscordController) GetRoutes(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
		return
	}

	guild, _ := dc.store.GetGuildByAlliance(allianceID)
	routesDB, _ := dc.store.GetAllRoutesForAlliance(allianceID)

	routeMap := make(map[string]map[string]interface{})
	for _, r := range routesDB {
		routeMap[r.EventType] = map[string]interface{}{
			"channelId":  r.ChannelID,
			"pingRoleId": r.PingRoleID,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"isLinked": guild != nil,
		"guildName": func() string {
			if guild != nil {
				return guild.GuildName
			}
			return ""
		}(),
		"routes": routeMap,
	})
}

func (dc *DiscordController) GetChannels(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
		return
	}

	guild, err := dc.store.GetGuildByAlliance(allianceID)
	if err != nil || guild == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Discord server linked to this scope"})
		return
	}

	req, _ := http.NewRequest("GET", "https://discord.com/api/v10/guilds/"+guild.GuildID+"/channels", nil)
	req.Header.Set("Authorization", "Bot "+dc.cfg.Discord.BotToken)

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to contact Discord"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Discord API returned an error"})
		return
	}

	var allChannels []DiscordChannel
	var textChannels []DiscordChannel

	if err := json.NewDecoder(resp.Body).Decode(&allChannels); err == nil {
		for _, ch := range allChannels {
			if ch.Type == 0 || ch.Type == 5 {
				textChannels = append(textChannels, ch)
			}
		}
	}

	c.JSON(http.StatusOK, textChannels)
}

func (dc *DiscordController) SaveRoute(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
		return
	}

	var input struct {
		EventType  string  `json:"eventType" binding:"required"`
		ChannelID  string  `json:"channelId" binding:"required"`
		PingRoleID *string `json:"pingRoleId"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	guild, err := dc.store.GetGuildByAlliance(allianceID)
	if err != nil || guild == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "No Discord server linked to this scope"})
		return
	}

	req, _ := http.NewRequest("GET", "https://discord.com/api/v10/channels/"+input.ChannelID, nil)
	req.Header.Set("Authorization", "Bot "+dc.cfg.Discord.BotToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify channel identity"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid channel ID or Bot lacks access"})
		return
	}

	var channelData struct {
		GuildID string `json:"guild_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&channelData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse channel verification"})
		return
	}

	if channelData.GuildID != guild.GuildID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Security Alert: Channel belongs to a different server."})
		return
	}

	err = dc.store.UpsertDiscordRoute(allianceID, input.EventType, input.ChannelID, input.PingRoleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save route"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_DISCORD_CONFIG"
	c.JSON(http.StatusOK, gin.H{"message": "Route saved securely"})
}

func (dc *DiscordController) PostSeasonRotation(c *gin.Context) {
	seasonId, _ := strconv.Atoi(c.Param("seasonId"))
	week, _ := strconv.Atoi(c.Param("week"))
	userID := getInt64FromContext(c, "userId")
	actionType = "fortress_rotation"
	redisKey := fmt.Sprintf("ratelimit:discord_btn:%s:user:%d", actionType, userID)

	allowed, err := dc.redisStore.AllowRequest(c.Request.Context(), redisKey, limit, cooldown)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Rate limiter unavailable"})
		return
	}

	if !allowed {
		rem, err := dc.redisStore.GetTimeRemaining(c.Request.Context(), redisKey)
		if err == nil && rem > 0 {
			remainingStr = fmt.Sprintf("%d", rem)
		}

		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       fmt.Sprintf("Please wait %s seconds before pinging again.", remainingStr),
			"retry_after": rem,
		})
		return
	}

	entries, err := dc.store.GetRotationForWeek(seasonId, week)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rotation"})
		return
	}

	targets := dc.store.GetBroadcastTargets("fortress_rotation", "general_announcements")
	successCount := 0

	for _, route := range targets {
		pingStr := services.FormatDiscordPing(route.PingRoleID)
		message := "🚨 Fortress Rotation Updated!"
		if pingStr != "" {
			message = pingStr + "\n" + message
		}

		err := services.SendDiscordRotation(dc.cfg.Discord.BotToken, route.ChannelID, seasonId, week, entries, message)
		if err == nil {
			successCount++
		} else {
			log.Printf("Failed to send rotation to channel %s: %v", route.ChannelID, err)
		}
	}

	logAction(c, dc.store, "DISCORD", fmt.Sprintf("Announced Rotation to %d servers", successCount))
	c.JSON(http.StatusOK, gin.H{"message": "Rotation announced!"})
}

func (dc *DiscordController) PostStrategy(c *gin.Context) {
	var req struct {
		Target    string `json:"target"`
		FightDate string `json:"fightDate"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if dc.cfg.Discord.BotToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Webhook not configured"})
		return
	}

	activeMeta, err := dc.store.GetActiveStrategy()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch active strategy"})
		return
	}

	userID := getInt64FromContext(c, "userId")
	actionType = "strategy_meta"
	redisKey := fmt.Sprintf("ratelimit:discord_btn:%s:user:%d", actionType, userID)

	allowed, err := dc.redisStore.AllowRequest(c.Request.Context(), redisKey, limit, cooldown)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Rate limiter unavailable"})
		return
	}

	if !allowed {
		rem, err := dc.redisStore.GetTimeRemaining(c.Request.Context(), redisKey)
		if err == nil && rem > 0 {
			remainingStr = fmt.Sprintf("%d", rem)
		}

		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       fmt.Sprintf("Please wait %s seconds before pinging again.", remainingStr),
			"retry_after": rem,
		})
		return
	}

	var targetMeta *models.BattleMetaRequest

	if req.Target == "Pet Schedule" {
		val, exists := c.Get("redisStore")
		if !exists {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Redis not found in context"})
			return
		}
		rStore, ok := val.(*cache.RedisStore)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Redis type mismatch"})
			return
		}

		scheduleData := make(map[int][]db.CaptainBadge)
		for i := 1; i <= 3; i++ {
			caps, err := dc.store.GetCaptainsForPetSlot(req.FightDate, i)
			if err != nil {
				log.Printf("DB Error fetching slot %d: %v", i, err)
				continue
			}
			scheduleData[i] = caps
		}

		imgBuffer, err := services.GeneratePetScheduleCard(req.FightDate, scheduleData, rStore)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Render failed: " + err.Error()})
			return
		}

		message := fmt.Sprintf("📢 Pet Rotation for %s is live!", req.FightDate)
		fileName := fmt.Sprintf("pets_%d.jpg", time.Now().Unix())

		targets := dc.store.GetBroadcastTargets("pet_alert", "general_announcements")

		imgBytes := imgBuffer.Bytes()
		successCount := 0

		for _, route := range targets {
			msg := message
			pingStr := services.FormatDiscordPing(route.PingRoleID)
			if pingStr != "" {
				msg = fmt.Sprintf("%s\n%s", pingStr, message)
			}
			err := services.SendDiscordImage(dc.cfg.Discord.BotToken, route.ChannelID, bytes.NewBuffer(imgBytes), fileName, msg)
			if err == nil {
				successCount++
			}
		}

		logAction(c, dc.store, "DISCORD", fmt.Sprintf("Announced Pets to %d servers", successCount))
		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Pet Image published to %d servers", successCount)})
		return
	}

	if req.Target == "Attack" && activeMeta.Attack != nil {
		targetMeta = activeMeta.Attack
	} else if req.Target == "Defense" && activeMeta.Defense != nil {
		targetMeta = activeMeta.Defense
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active strategy found for " + req.Target})
		return
	}

	allHeroes, _ := dc.store.GetHeroes()
	heroMap := make(map[int]string)
	for _, h := range allHeroes {
		heroMap[h.ID] = h.LocalImagePath
	}

	var leadPaths, joinerPaths []string
	for _, id := range targetMeta.Leads {
		leadPaths = append(leadPaths, heroMap[id])
	}
	for _, id := range targetMeta.Joiners {
		joinerPaths = append(joinerPaths, heroMap[id])
	}

	cardData := services.MetaCardData{
		Type:          req.Target,
		InfantryRatio: targetMeta.InfantryRatio,
		LancerRatio:   targetMeta.LancerRatio,
		MarksmanRatio: targetMeta.MarksmanRatio,
		LeadImages:    leadPaths,
		JoinerImages:  joinerPaths,
	}

	imgBuffer, err := services.GenerateMetaCard(cardData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate image"})
		return
	}

	message := fmt.Sprintf("🚨 %s Strategy Deployed! 🚨", req.Target)

	targets := dc.store.GetBroadcastTargets("global_war_room", "general_announcements")

	imgBytes := imgBuffer.Bytes()
	successCount := 0

	for _, route := range targets {
		msg := message
		pingStr := services.FormatDiscordPing(route.PingRoleID)
		if pingStr != "" {
			msg = fmt.Sprintf("%s\n%s", pingStr, message)
		}

		err := services.SendDiscordImage(dc.cfg.Discord.BotToken, route.ChannelID, bytes.NewBuffer(imgBytes), "strategy.jpg", msg)
		if err == nil {
			successCount++
		}
	}

	logAction(c, dc.store, "DISCORD", fmt.Sprintf("Announced %s Strategy to %d servers", req.Target, successCount))
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Published to %d Discord servers", successCount)})
}

func (dc *DiscordController) PostAnnouncement(c *gin.Context) {
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Color       int    `json:"color"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if dc.cfg.Discord.BotToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Webhook not configured"})
		return
	}

	routes, err := dc.store.GetWarRoomBroadcastRoutes()
	if err != nil || len(routes) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Discord channels are configured to receive this alert."})
		return
	}

	userID := getInt64FromContext(c, "userId")
	actionType = "dynamic_announcement"
	redisKey := fmt.Sprintf("ratelimit:discord_btn:%s:user:%d", actionType, userID)

	allowed, err := dc.redisStore.AllowRequest(c.Request.Context(), redisKey, limit, cooldown)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Rate limiter unavailable"})
		return
	}

	if !allowed {
		rem, err := dc.redisStore.GetTimeRemaining(c.Request.Context(), redisKey)
		if err == nil && rem > 0 {
			remainingStr = fmt.Sprintf("%d", rem)
		}

		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       fmt.Sprintf("Please wait %s seconds before pinging again.", remainingStr),
			"retry_after": rem,
		})
		return
	}

	successCount := 0
	for _, route := range routes {
		desc := req.Description
		pingStr := ""
		if route.PingRoleID != nil && *route.PingRoleID != "" {
			pingStr = services.FormatDiscordPing(route.PingRoleID)
		}

		err := services.SendCustomDiscordEmbed(dc.cfg.Discord.BotToken, route.ChannelID, req.Title, desc, req.Color, pingStr)
		if err == nil {
			successCount++
		} else {
			log.Printf("Failed to broadcast to channel %s: %v", route.ChannelID, err)
		}
	}

	logAction(c, dc.store, "DISCORD_BROADCAST", fmt.Sprintf("Announced '%s' to %d servers", req.Title, successCount))

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Broadcast sent successfully to %d Discord servers!", successCount),
	})
}

func (dc *DiscordController) GetRoles(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
		return
	}

	guild, err := dc.store.GetGuildByAlliance(allianceID)
	if err != nil || guild == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Discord server linked to this scope"})
		return
	}

	req, _ := http.NewRequest("GET", "https://discord.com/api/v10/guilds/"+guild.GuildID+"/roles", nil)
	req.Header.Set("Authorization", "Bot "+dc.cfg.Discord.BotToken)

	client := &http.Client{}
	resp, err := client.Do(req)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to contact Discord"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Discord API returned an error"})
		return
	}

	var allRoles []DiscordRole
	var selectableRoles []DiscordRole

	if err := json.NewDecoder(resp.Body).Decode(&allRoles); err == nil {
		for _, role := range allRoles {
			if !role.Managed {
				if role.Name == "@everyone" {
					role.ID = "everyone"
					role.Name = "everyone"
				}
				selectableRoles = append(selectableRoles, role)
			}
		}
	}

	c.JSON(http.StatusOK, selectableRoles)
}

func (dc *DiscordController) GetCustomCrons(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	crons, err := dc.store.GetCustomCrons(allianceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch scheduled alerts"})
		return
	}
	c.JSON(http.StatusOK, crons)
}

func (dc *DiscordController) CreateCustomCron(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Name             string    `json:"name" binding:"required"`
		NextRunTime      time.Time `json:"nextRunTime" binding:"required"`
		RecurrenceType   string    `json:"recurrenceType" binding:"required"`
		RecurrenceConfig string    `json:"recurrenceConfig"`
		Message          string    `json:"message" binding:"required"`
		ChannelID        string    `json:"channelId" binding:"required"`
		PingRoleID       *string   `json:"pingRoleId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}

	newJob := db.DiscordCustomCron{
		AllianceID:       allianceID,
		Name:             req.Name,
		ChannelID:        req.ChannelID,
		NextRunTime:      req.NextRunTime,
		RecurrenceType:   req.RecurrenceType,
		RecurrenceConfig: req.RecurrenceConfig,
		Message:          req.Message,
		PingRoleID:       req.PingRoleID,
		IsActive:         true,
	}

	if err := dc.store.CreateCustomCron(&newJob); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save scheduled alert"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_CRONS"
	c.JSON(http.StatusOK, newJob)
}

func (dc *DiscordController) DeleteCustomCron(c *gin.Context) {
	allianceID, _ := dc.resolveTargetAlliance(c)
	id, _ := strconv.Atoi(c.Param("id"))

	if err := dc.store.DeleteCustomCron(id, allianceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete alert"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_CRONS"
	c.JSON(http.StatusOK, gin.H{"message": "Alert deleted"})
}

func (dc *DiscordController) ToggleCustomCron(c *gin.Context) {
	allianceID, _ := dc.resolveTargetAlliance(c)
	id, _ := strconv.Atoi(c.Param("id"))

	if err := dc.store.ToggleCustomCron(id, allianceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to toggle alert"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_CRONS"
	c.JSON(http.StatusOK, gin.H{"message": "Alert status updated"})
}

func (dc *DiscordController) DeleteRoute(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	eventType := c.Param("eventType")
	if eventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Event type is required"})
		return
	}

	if err := dc.store.DeleteDiscordRoute(allianceID, eventType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlink route"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_CRONS"
	c.JSON(http.StatusOK, gin.H{"message": "Route unlinked successfully"})
}

func (dc *DiscordController) DisconnectServer(c *gin.Context) {
	allianceID, err := dc.resolveTargetAlliance(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	guildID, _ := dc.store.GetDiscordGuildID(allianceID)

	if guildID != "" {
		req, _ := http.NewRequest("DELETE", "https://discord.com/api/v10/users/@me/guilds/"+guildID, nil)
		req.Header.Set("Authorization", "Bot "+dc.cfg.Discord.BotToken)
		client := &http.Client{}
		resp, err := client.Do(req)
		if err == nil && resp != nil {
			resp.Body.Close()
		}
	}

	if err := dc.store.DisconnectDiscordServer(allianceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to disconnect server"})
		return
	}

	dc.sseBroker.Notifier <- "REFRESH_DISCORD_CONFIG"
	c.JSON(http.StatusOK, gin.H{"message": "Server disconnected and bot has left the guild."})
}

func (dc *DiscordController) EditCustomCron(c *gin.Context) {
	allianceID, _ := dc.resolveTargetAlliance(c)
	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		Name             string    `json:"name" binding:"required"`
		NextRunTime      time.Time `json:"nextRunTime" binding:"required"`
		RecurrenceType   string    `json:"recurrenceType" binding:"required"`
		RecurrenceConfig string    `json:"recurrenceConfig"`
		Message          string    `json:"message" binding:"required"`
		ChannelID        string    `json:"channelId" binding:"required"`
		PingRoleID       *string   `json:"pingRoleId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	job := db.DiscordCustomCron{
		ID:               id,
		Name:             req.Name,
		AllianceID:       allianceID,
		ChannelID:        req.ChannelID,
		NextRunTime:      req.NextRunTime,
		RecurrenceType:   req.RecurrenceType,
		RecurrenceConfig: req.RecurrenceConfig,
		Message:          req.Message,
		PingRoleID:       req.PingRoleID,
	}

	if err := dc.store.UpdateCustomCron(&job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update alert"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Alert updated"})
}
