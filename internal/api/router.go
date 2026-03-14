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

	sseBroker := services.NewSSEBroker()

	authCtrl := NewAuthController(store, cfg, pClient, redisStore, sseBroker)
	playerCtrl := NewPlayerController(store, cfg)
	adminCtrl := NewAdminController(store, sseBroker)
	warCtrl := NewWarController(store, cfg, pClient, sseBroker)
	redeemCtrl := NewRedeemController(store, cfg, pClient, redisStore, engine)
	allianceCtrl := NewAllianceController(store, sseBroker)

	r.POST("/api/login", authCtrl.Login)
	r.POST("/api/login/mfa", authCtrl.VerifyMFA)
	r.POST("/api/refresh", authCtrl.Refresh)
	r.POST("/api/login/player", authCtrl.PlayerLogin)
	if cfg.FeaturesConfig.Discord {
		discordCtrl := NewDiscordController(store, cfg, cronManager, redisStore, sseBroker)
		r.GET("/api/moderator/discord/callback", discordCtrl.CallbackHandler)
	}
	if cfg.FeaturesConfig.Strategy {
		strategyCtrl := NewStrategyController(store, cfg, redisStore)
		r.GET("/api/shared-assets/heroes/:filename", strategyCtrl.HeroIcon)
	}
	r.GET("/api/webauthn/login/begin", authCtrl.WebAuthNLoginBegin)
	r.POST("/api/webauthn/login/finish", authCtrl.WebAuthNLoginEnd)

	r.GET("/api/system/features", func(c *gin.Context) {
		c.JSON(200, cfg.FeaturesConfig)
	})

	playerGroup := r.Group("/api/player")
	playerGroup.Use(AuthMiddleware(store))
	{
		playerGroup.GET("/me", playerCtrl.GetPlayerInfo)
		playerGroup.GET("/dashboard", playerCtrl.GetPlayerDashboard)
	}

	authorized := r.Group("/api/moderator")
	authorized.Use(AuthMiddleware(store))
	{
		authorized.GET("/stream", func(c *gin.Context) {
			c.Writer.Header().Set("Content-Type", "text/event-stream")
			c.Writer.Header().Set("Cache-Control", "no-cache")
			c.Writer.Header().Set("Connection", "keep-alive")

			clientChan := make(services.Client)
			sseBroker.AddClient(clientChan)
			defer sseBroker.RemoveClient(clientChan)

			notify := c.Request.Context().Done()
			for {
				select {
				case <-notify:
					return
				case msg := <-clientChan:
					c.SSEvent("message", msg)
					c.Writer.Flush()
				}
			}
		})

		if cfg.FeaturesConfig.GiftCodes && engine != nil {
			authorized.GET("/captcha-balance", redeemCtrl.GetBalance)
			authorized.POST("/redeem", redeemCtrl.Redeem)
			authorized.GET("/jobs", redeemCtrl.GetRecentJobs)
			authorized.GET("/job/current", redeemCtrl.GetActiveJob)
			authorized.GET("/reports/:filename", redeemCtrl.GetActiveJob)
		}

		if cfg.FeaturesConfig.WarRoom {
			authorized.GET("/war-room/stats", warCtrl.GetWarStats)
			authorized.POST("/war-room/deploy", warCtrl.DeployToWarRoom)
			authorized.POST("/war-room/lock", warCtrl.LockWarRoom)
			authorized.POST("/war-room/reset", warCtrl.ArchiveAndResetEvent)
			authorized.GET("/war-room/history", warCtrl.GetEventHistory)
			authorized.GET("/war-room/history/:id", warCtrl.GetPastEvent)
			authorized.GET("/war-room/filters", warCtrl.GetWarRoomFilter)
			authorized.GET("/war-room/attendance-stats", warCtrl.GetWarAttendanceStats)
		}

		if cfg.FeaturesConfig.Squads {
			authorized.GET("/squads/:allianceId", warCtrl.GetSquads)
			authorized.POST("/squads/promote", warCtrl.PromoteCaptain)
			authorized.POST("/squads/demote", warCtrl.DemoteCaptain)
			authorized.POST("/squads/assign", warCtrl.AssignPlayerToSquad)
		}

		if cfg.FeaturesConfig.Strategy {
			strategyCtrl := NewStrategyController(store, cfg, redisStore)
			authorized.GET("/strategy/heroes", strategyCtrl.GetHeroes)
			authorized.POST("/strategy/meta", strategyCtrl.SaveStrategy)
			authorized.GET("/strategy/active", strategyCtrl.GetActiveStrategy)
			authorized.GET("/strategy/captains", strategyCtrl.GetCaptains)
			authorized.POST("/strategy/pets", strategyCtrl.SavePetSchedule)
			authorized.GET("/strategy/pets", strategyCtrl.GetPetSchedule)
			if cfg.FeaturesConfig.Discord {
				discordCtrl := NewDiscordController(store, cfg, cronManager, redisStore, sseBroker)
				authorized.POST("/strategy/notify", discordCtrl.PostStrategy)
			}
		}

		if cfg.FeaturesConfig.Ministry {
			ministryCtrl := NewMinistryController(store, sseBroker)
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
		}

		if cfg.FeaturesConfig.Foundry {
			foundryCtrl := NewFoundryController(store, cfg, sseBroker)
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

		authorized.GET("/admin/alliances", adminCtrl.ListAlliances)
		authorized.POST("/admin/alliances", adminCtrl.CreateAlliance)
		authorized.PUT("/admin/alliances/:id", adminCtrl.UpdateAlliance)
		authorized.DELETE("/admin/alliances/:id", adminCtrl.DeleteAlliance)
		authorized.GET("/admin/audit-logs", adminCtrl.GetAuditLogs)
		authorized.POST("/admin/request", allianceCtrl.HandleTransferRequest)
		authorized.GET("/admin/pending", allianceCtrl.GetNotifications)
		authorized.PUT("/admin/:id/resolve", allianceCtrl.HandleResolve)
		authorized.POST("/players", warCtrl.AddPlayer)
		if cfg.FeaturesConfig.Transfers {
			transfersCtrl := NewTransfersController(store, cfg, pClient, sseBroker)
			authorized.POST("/players/:fid/transfer-out", transfersCtrl.ConfirmOutbandTransfer)

		}
		authorized.DELETE("/players/:fid", warCtrl.DeletePlayer)
		authorized.GET("/profile", authCtrl.GetUserProfile)
		authorized.POST("/change-password", authCtrl.ChangePassword)
		authorized.GET("/mfa/generate", authCtrl.GenerateMfa)
		authorized.POST("/mfa/enable", authCtrl.EnableMfa)

		authorized.GET("/players", warCtrl.GetPlayerRoster)
		authorized.PUT("/players/:fid", warCtrl.UpdatePlayer)

		authorized.GET("/options", func(c *gin.Context) {
			alliances, _ := store.GetAlliances()
			teams, _ := store.GetTeams()
			rosterstats, _ := store.GetRosterStats()
			c.JSON(200, gin.H{"alliances": alliances, "teams": teams, "rosterstats": rosterstats})
		})

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

		if cfg.FeaturesConfig.Transfers {
			transfersCtrl := NewTransfersController(store, cfg, pClient, sseBroker)
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
		}

		if cfg.FeaturesConfig.Rotation {
			fortressCtrl := NewFortressController(store, cfg, sseBroker)
			rotation := authorized.Group("/rotation")
			{
				rotation.GET("/buildings", fortressCtrl.GetAllBuildings)
				rotation.GET("/schedule/:seasonId", fortressCtrl.GetSeasonSchedule)
				rotation.GET("/rewards/:week", fortressCtrl.GetWeeklyRewards)
				rotation.POST("/save", AdminOnlyMiddleware(), fortressCtrl.UpdateSeason)
				rotation.GET("/seasons", fortressCtrl.GetSeasonHistory)
			}
		}

		if cfg.FeaturesConfig.Discord {
			discordCtrl := NewDiscordController(store, cfg, cronManager, redisStore, sseBroker)
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
				discord.PUT("/crons/:id", discordCtrl.EditCustomCron)
				discord.POST("/announce-map", discordCtrl.AnnounceTacticalMap)
			}
		}
	}
	return r
}
