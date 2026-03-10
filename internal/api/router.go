package api

import (
	"fmt"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/processor"
	"gift-redeemer/internal/services"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func logAction(c *gin.Context, store *db.Store, action string, details string) {
	userId, _ := c.Get("userId")
	uid, ok := userId.(int64)
	if !ok {
		uid = 0
	}

	_ = store.CreateAuditLog(db.AuditLog{
		UserID:    uid,
		Action:    action,
		Details:   details,
		IPAddress: c.ClientIP(),
	})
}

func getAllianceID(c *gin.Context) (int, error) {
	rawId, exists := c.Get("allianceId")
	if !exists {
		return 0, fmt.Errorf("not in context")
	}

	allianceIdPtr, ok := rawId.(*int)
	if !ok || allianceIdPtr == nil {
		return 0, fmt.Errorf("no alliance assigned")
	}
	return *allianceIdPtr, nil
}

func SetupRouter(engine *processor.Processor, store *db.Store, cfg *config.Config, pClient *client.PlayerClient, redisStore *cache.RedisStore, cronManager *services.CronManager) *gin.Engine {

	r := gin.Default()
	r.Use(func(c *gin.Context) {
		c.Set("redisStore", redisStore)
		c.Next()
	})

	r.ForwardedByClientIP = true
	err := r.SetTrustedProxies([]string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.1/8",
	})
	if err != nil {
		log.Printf("Warning: Failed to set trusted proxies: %v", err)
	}

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", cfg.BioID.ApplicationURL)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-API-Key")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	discordCtrl := NewDiscordController(store, cfg, cronManager)
	authCtrl := NewAuthController(store, cfg, pClient, redisStore)
	playerCtrl := NewPlayerController(store, cfg)
	strategyCtrl := NewStrategyController(store, cfg, redisStore)
	transfersCtrl := NewTransfersController(store, cfg, pClient)
	adminCtrl := NewAdminController(store)
	ministryCtrl := NewMinistryController(store)
	foundryCtrl := NewFoundryController(store, cfg)
	fortressCtrl := NewFortressController(store, cfg)
	warCtrl := NewWarController(store, cfg, engine)
	redeemCtrl := NewRedeemController(store, cfg, pClient, redisStore, engine)
	allianceCtrl := NewAllianceController(store)

	r.POST("/api/login", authCtrl.Login)
	r.POST("/api/login/mfa", authCtrl.VerifyMFA)
	r.POST("/api/refresh", authCtrl.Refresh)
	r.POST("/api/login/player", authCtrl.PlayerLogin)
	r.GET("/api/moderator/discord/callback", discordCtrl.CallbackHandler)
	r.GET("/api/shared-assets/heroes/:filename", strategyCtrl.HeroIcon)
	r.GET("/api/webauthn/login/begin", authCtrl.WebAuthNLoginBegin)
	r.POST("/api/webauthn/login/finish", authCtrl.WebAuthNLoginEnd)

	playerGroup := r.Group("/api/player")
	playerGroup.Use(AuthMiddleware(store))
	{
		playerGroup.GET("/me", playerCtrl.GetPlayerInfo)
		playerGroup.GET("/dashboard", playerCtrl.GetPlayerDashboard)
	}

	authorized := r.Group("/api/moderator")
	authorized.Use(AuthMiddleware(store))
	{
		authorized.GET("/strategy/heroes", strategyCtrl.GetHeroes)
		authorized.POST("/strategy/meta", strategyCtrl.SaveStrategy)
		authorized.GET("/strategy/active", strategyCtrl.GetActiveStrategy)
		authorized.GET("/strategy/captains", strategyCtrl.GetCaptains)
		authorized.POST("/strategy/pets", strategyCtrl.SavePetSchedule)
		authorized.GET("/strategy/pets", strategyCtrl.GetPetSchedule)
		authorized.POST("/strategy/notify", discordCtrl.PostStrategy)
		authorized.GET("/admin/alliances", adminCtrl.ListAlliances)
		authorized.POST("/admin/alliances", adminCtrl.CreateAlliance)
		authorized.PUT("/admin/alliances/:id", adminCtrl.UpdateAlliance)
		authorized.DELETE("/admin/alliances/:id", adminCtrl.DeleteAlliance)
		authorized.GET("/admin/audit-logs", adminCtrl.GetAuditLogs)
		authorized.POST("/admin/request", allianceCtrl.HandleTransferRequest)
		authorized.GET("/admin/pending", allianceCtrl.GetNotifications)
		authorized.PUT("/admin/:id/resolve", allianceCtrl.HandleResolve)
		authorized.GET("/captcha-balance", redeemCtrl.GetBalance)
		authorized.POST("/redeem", redeemCtrl.Redeem)
		authorized.POST("/players", warCtrl.AddPlayer)
		authorized.POST("/players/:fid/transfer-out", transfersCtrl.ConfirmOutbandTransfer)
		authorized.DELETE("/players/:fid", warCtrl.DeletePlayer)
		authorized.GET("/profile", authCtrl.GetUserProfile)
		authorized.POST("/change-password", authCtrl.ChangePassword)
		authorized.GET("/mfa/generate", authCtrl.GenerateMfa)
		authorized.POST("/mfa/enable", authCtrl.EnableMfa)
		authorized.GET("/jobs", redeemCtrl.GetRecentJobs)
		authorized.GET("/job/current", redeemCtrl.GetActiveJob)
		authorized.GET("/reports/:filename", redeemCtrl.GetActiveJob)
		authorized.GET("/war-room/stats", warCtrl.GetWarStats)
		authorized.POST("/war-room/deploy", warCtrl.DeployToWarRoom)
		authorized.POST("/war-room/lock", warCtrl.LockWarRoom)
		authorized.POST("/war-room/reset", warCtrl.ArchiveAndResetEvent)
		authorized.GET("/war-room/history", warCtrl.GetEventHistory)
		authorized.GET("/war-room/history/:id", warCtrl.GetPastEvent)
		authorized.GET("/squads/:allianceId", warCtrl.GetSquads)
		authorized.POST("/squads/promote", warCtrl.PromoteCaptain)
		authorized.POST("/squads/demote", warCtrl.DemoteCaptain)
		authorized.POST("/squads/assign", warCtrl.AssignPlayerToSquad)
		authorized.GET("/players", warCtrl.GetPlayerRoster)
		authorized.PUT("/players/:fid", warCtrl.UpdatePlayer)
		authorized.GET("/war-room/filters", warCtrl.GetWarRoomFilter)

		authorized.GET("/options", func(c *gin.Context) {
			alliances, _ := store.GetAlliances()
			teams, _ := store.GetTeams()
			rosterstats, _ := store.GetRosterStats()
			c.JSON(200, gin.H{"alliances": alliances, "teams": teams, "rosterstats": rosterstats})
		})

		ministry := authorized.Group("/ministry")
		{
			ministry.GET("/active", ministryCtrl.GetActiveEvent)
			ministry.POST("/events", ministryCtrl.CreateEvent)
			ministry.PUT("/events/:id/status", ministryCtrl.UpdateActiveEvent)
			ministry.PUT("/slots/:id", ministryCtrl.UpdateMinistrySlot)
			ministry.PUT("/events/:id/announce", ministryCtrl.ToggleNotifications)
			ministry.GET("/history", ministryCtrl.GetHistory)
			ministry.GET("/history/:id", ministryCtrl.GetHistorySlots)
		}

		foundry := authorized.Group("/foundry")
		{
			foundry.GET("/state", foundryCtrl.GetEventState)
			foundry.POST("/deploy", foundryCtrl.DeployPlayer)
			foundry.POST("/lock", foundryCtrl.LockEvent)
			foundry.POST("/attendance", foundryCtrl.UpdateAttendance)
			foundry.POST("/reset", foundryCtrl.ResetAndArchiveEvent)
			foundry.GET("/history", foundryCtrl.GetEventHistory)
			foundry.GET("/history/:id", foundryCtrl.GetEventInHistory)
			foundry.POST("/announce", foundryCtrl.AnnounceFoundry)
		}
	}

	admin := r.Group("/api/admin")
	admin.Use(AuthMiddleware(store))
	admin.Use(func(c *gin.Context) {
		role := c.GetString("role")
		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Access denied: Admins only"})
			return
		}
		c.Next()
	})
	{
		admin.GET("/webauthn/register/begin", authCtrl.WebAuthNLRegisterBegin)
		admin.POST("/webauthn/register/finish", authCtrl.WebAuthNLRegisterEnd)
		admin.DELETE("/webauthn/device", authCtrl.WebAuthNDeleteDevice)
		admin.POST("/users/:id/reset-security", authCtrl.ResetUserSecurity)
		admin.GET("/auth/me", AuthMiddleware(store), authCtrl.AuthMe)
		admin.GET("/users", adminCtrl.GetAllUsers)
		admin.POST("/users", adminCtrl.CreateUser)
		admin.PUT("/users/:id", adminCtrl.UpdateUser)
		admin.POST("/sync-roster", warCtrl.SyncRoster)
		admin.DELETE("/users/:id", adminCtrl.DeleteUser)

		transfers := authorized.Group("/transfers")
		{
			transfers.GET("/active", transfersCtrl.GetActiveSeason)
			transfers.POST("/seasons", transfersCtrl.CreateTransferSeason)
			transfers.POST("/bulk-add", transfersCtrl.AddPlayersForTransfer)
			transfers.PUT("/:id", transfersCtrl.UpdateTransferRecord)
			transfers.POST("/:id/confirm-inbound", transfersCtrl.ConfirmTransfer)
			transfers.PUT("/seasons/:id/status", transfersCtrl.UpdateSeasonStatus)
			transfers.GET("/history", transfersCtrl.GetTransferHistory)
			transfers.GET("/seasons/:id/records", transfersCtrl.GetTransferRecords)
			transfers.PUT("/seasons/:id", transfersCtrl.EditTransferSeason)
		}

		rotation := authorized.Group("/rotation")
		{
			rotation.GET("/buildings", fortressCtrl.GetAllBuildings)
			rotation.GET("/schedule/:seasonId", fortressCtrl.GetSeasonSchedule)
			rotation.GET("/rewards/:week", fortressCtrl.GetWeeklyRewards)
			rotation.POST("/save", AdminOnlyMiddleware(), fortressCtrl.UpdateSeason)
			rotation.GET("/seasons", fortressCtrl.GetSeasonHistory)
		}

		discord := authorized.Group("/discord")
		{
			discord.GET("/login", AuthMiddleware(store), discordCtrl.LoginHandler)
			discord.POST("/rotation/:seasonId/:week", discordCtrl.PostSeasonRotation)
			discord.POST("/announce", discordCtrl.PostAnnouncement)
			discord.GET("/status", discordCtrl.GetRoutes)
			discord.GET("/channels", discordCtrl.GetChannels)
			discord.POST("/routes", discordCtrl.SaveRoute)
			discord.GET("/roles", discordCtrl.GetRoles)
			discord.GET("/crons", discordCtrl.GetCustomCrons)
			discord.POST("/crons", discordCtrl.CreateCustomCron)
			discord.DELETE("/crons/:id", discordCtrl.DeleteCustomCron)
			discord.PUT("/crons/:id/toggle", discordCtrl.ToggleCustomCron)
			discord.DELETE("/routes/:eventType", discordCtrl.DeleteRoute)
			discord.DELETE("/disconnect", discordCtrl.DisconnectServer)
			discord.PUT("/discord/crons/:id", discordCtrl.EditCustomCron)
		}
	}
	return r
}
