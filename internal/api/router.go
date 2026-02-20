package api

import (
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/processor"
	"gift-redeemer/internal/services"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
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

func SetupRouter(engine *processor.Processor, store *db.Store, targetState int, apiKey string) *gin.Engine {
	r := gin.Default()

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
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-API-Key")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/api/login", func(c *gin.Context) {
		ip := c.ClientIP()

		if engine.Redis.GetLoginAttempts(ip) >= 5 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many failed attempts. Try again in 15 minutes."})
			return
		}

		var input struct {
			Username string `json:"username" binding:"required"`
			Password string `json:"password" binding:"required"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, err := store.GetUserByUsername(input.Username)
		if err != nil {
			engine.Redis.RecordFailedLogin(ip)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		if !auth.CheckPassword(input.Password, user.PasswordHash) {
			engine.Redis.RecordFailedLogin(ip)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		engine.Redis.ClearLoginAttempts(ip)

		if user.MFAEnabled {
			tempToken := fmt.Sprintf("%d", time.Now().UnixNano())

			engine.Redis.SetMfaSession(tempToken, user.Username)

			c.JSON(http.StatusOK, gin.H{
				"mfa_required": true,
				"temp_token":   tempToken,
			})
			return
		}

		token, _ := auth.GenerateToken(user.Username, user.Role)
		c.JSON(http.StatusOK, gin.H{"token": token, "role": user.Role, "mfa_enabled": user.MFAEnabled})
	})

	r.POST("/api/login/mfa", func(c *gin.Context) {
		var input struct {
			TempToken string `json:"temp_token" binding:"required"`
			Code      string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			return
		}

		username := engine.Redis.GetMfaSession(input.TempToken)
		if username == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired. Please log in again."})
			return
		}

		user, _ := store.GetUserByUsername(username)
		if !totp.Validate(input.Code, user.MFASecret) {
			// Optional: you could add rate limiting here too!
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authenticator code"})
			return
		}

		engine.Redis.DeleteMfaSession(input.TempToken)
		token, _ := auth.GenerateToken(user.Username, user.Role)

		c.JSON(http.StatusOK, gin.H{"token": token, "role": user.Role})
	})

	r.POST("/api/login/player", func(c *gin.Context) {
		var input struct {
			FID int64 `json:"fid" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "Game ID (FID) is required"})
			return
		}

		info, err := engine.PlayerClient.GetPlayerInfo(input.FID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to connect to Game API"})
			return
		}
		if info.Code != 0 {
			c.JSON(401, gin.H{"error": "Player not found or invalid ID"})
			return
		}

		if info.Data.KID != targetState {
			c.JSON(403, gin.H{
				"error": fmt.Sprintf("Access Denied. This tool is for State 391 only. You are in State %d.", info.Data.KID),
			})
			return
		}

		err = store.UpsertPlayer(
			input.FID,
			info.Data.Nickname,
			info.Data.KID,
			info.Data.StoveLv,
			info.Data.StoveImg,
			info.Data.Avatar,
		)
		if err != nil {
			c.JSON(500, gin.H{"error": "Database error saving player"})
			return
		}

		fidStr := fmt.Sprintf("%d", input.FID)
		token, _ := auth.GenerateToken(fidStr, "player")

		c.JSON(200, gin.H{"token": token, "role": "player", "nickname": info.Data.Nickname})
	})

	playerGroup := r.Group("/api/player")
	playerGroup.Use(AuthMiddleware(store))
	{
		playerGroup.GET("/me", func(c *gin.Context) {
			if c.GetString("role") != "player" {
				c.JSON(403, gin.H{"error": "Player access only"})
				return
			}

			fidStr := c.GetString("username")
			fid, _ := strconv.ParseInt(fidStr, 10, 64)

			profile, err := store.GetPlayerProfile(fid)
			if err != nil {
				c.JSON(404, gin.H{"error": "Profile not found"})
				return
			}

			c.JSON(200, profile)
		})

		playerGroup.GET("/dashboard", func(c *gin.Context) {
			fidStr := c.GetString("username")

			fid, err := strconv.ParseInt(fidStr, 10, 64)
			if err != nil {
				c.JSON(401, gin.H{"error": "Invalid token identity"})
				return
			}

			data, err := store.GetPlayerDashboardData(fid)
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to load dashboard"})
				return
			}

			c.JSON(200, data)
		})
	}

	authorized := r.Group("/api/moderator")
	authorized.Use(AuthMiddleware(store))
	{
		authorized.GET("/admin/alliances", func(c *gin.Context) {
			list, err := store.GetAlliances()
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to fetch alliances"})
				return
			}
			c.JSON(200, list)
		})

		// 2. Create New Alliance
		authorized.POST("/admin/alliances", func(c *gin.Context) {
			var input struct {
				Name string `json:"name" binding:"required"`
				Type string `json:"type" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": "Name and Type are required"})
				return
			}
			if err := store.CreateAlliance(input.Name, input.Type); err != nil {
				c.JSON(500, gin.H{"error": "Database error"})
				return
			}
			c.JSON(200, gin.H{"message": "Alliance created successfully"})
		})

		// 3. Update Alliance
		authorized.PUT("/admin/alliances/:id", func(c *gin.Context) {
			id, _ := strconv.Atoi(c.Param("id"))
			var input struct {
				Name string `json:"name" binding:"required"`
				Type string `json:"type" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": "Invalid input"})
				return
			}
			if err := store.UpdateAlliance(id, input.Name, input.Type); err != nil {
				c.JSON(500, gin.H{"error": "Update failed"})
				return
			}
			c.JSON(200, gin.H{"message": "Alliance updated"})
		})

		// 4. Delete Alliance
		authorized.DELETE("/admin/alliances/:id", func(c *gin.Context) {
			id, _ := strconv.Atoi(c.Param("id"))
			if err := store.DeleteAlliance(id); err != nil {
				// Note: This usually fails if players are still assigned (Foreign Key)
				c.JSON(400, gin.H{"error": "Cannot delete: Ensure no players are assigned to this alliance first."})
				return
			}
			c.JSON(200, gin.H{"message": "Alliance deleted"})
		})

		authorized.GET("/admin/audit-logs", func(c *gin.Context) {
			if c.GetString("role") != "admin" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
				return
			}

			logs, err := store.GetAuditLogs()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch logs"})
				return
			}

			c.JSON(http.StatusOK, logs)
		})

		authorized.GET("/captcha-balance", func(c *gin.Context) {
			url := fmt.Sprintf("https://2captcha.com/res.php?key=%s&action=getbalance&json=1", apiKey)

			resp, err := http.Get(url)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to 2captcha"})
				return
			}
			defer resp.Body.Close()

			var result struct {
				Status  int    `json:"status"`
				Request string `json:"request"`
			}

			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse 2captcha response"})
				return
			}

			if result.Status != 1 {
				c.JSON(http.StatusBadRequest, gin.H{"error": result.Request})
				return
			}

			c.JSON(http.StatusOK, gin.H{"balance": result.Request})
		})

		authorized.POST("/redeem", func(c *gin.Context) {
			var input struct {
				GiftCodes []string `json:"giftCodes" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				return
			}

			if engine.IsJobRunning() {
				c.JSON(409, gin.H{"error": "A job is already running"})
				return
			}

			user, _ := store.GetUserByUsername(c.GetString("username"))

			players, _ := store.GetPlayers(nil)

			var targets []models.PlayerData
			for _, p := range players {
				targets = append(targets, models.PlayerData{Fid: p.FID, Nickname: p.Nickname})
			}

			jobID, err := engine.StartJob(input.GiftCodes, targets, int64(user.ID))
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to start redemption job"})
				return
			}
			details := fmt.Sprintf("Started redemption job with codes: %v", input.GiftCodes)
			logAction(c, store, "START_REDEMPTION", details)

			c.JSON(200, gin.H{"message": "Job Started", "jobId": jobID})
		})

		authorized.POST("/players", func(c *gin.Context) {
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

			added, skipped, err := store.AddPlayers(ids)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": fmt.Sprintf("Processed %d IDs", len(ids)),
				"added":   added,
				"skipped": skipped,
			})
		})

		authorized.DELETE("/players/:fid", func(c *gin.Context) {
			fid, err := strconv.ParseInt(c.Param("fid"), 10, 64)
			if err != nil {
				c.JSON(400, gin.H{"error": "Invalid Player ID"})
				return
			}

			if err := store.DeletePlayer(fid); err != nil {
				c.JSON(500, gin.H{"error": "Failed to delete player from database"})
				return
			}

			c.JSON(200, gin.H{"message": "Player removed from roster"})
		})

		authorized.POST("/change-password", func(c *gin.Context) {
			var input struct {
				OldPassword string `json:"oldPassword" binding:"required"`
				NewPassword string `json:"newPassword" binding:"required"`
			}

			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			username := c.GetString("username")

			user, err := store.GetUserByUsername(username)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
				return
			}

			if !auth.CheckPassword(input.OldPassword, user.PasswordHash) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect old password"})
				return
			}

			newHash, _ := auth.HashPassword(input.NewPassword)

			if err := store.UpdatePassword(username, newHash); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
		})

		authorized.GET("/mfa/generate", func(c *gin.Context) {
			username := c.GetString("username")

			key, err := totp.Generate(totp.GenerateOpts{
				Issuer:      "WoS Admin Panel",
				AccountName: username,
			})
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to generate MFA token"})
				return
			}

			c.JSON(200, gin.H{"secret": key.Secret(), "url": key.URL()})
		})

		authorized.POST("/mfa/enable", func(c *gin.Context) {
			var input struct {
				Secret string `json:"secret" binding:"required"`
				Code   string `json:"code" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				return
			}

			username := c.GetString("username")
			user, _ := store.GetUserByUsername(username)

			valid := totp.Validate(input.Code, input.Secret)
			if !valid {
				c.JSON(400, gin.H{"error": "Invalid authenticator code"})
				return
			}

			if err := store.EnableUserMFA(int64(user.ID), input.Secret); err != nil {
				c.JSON(500, gin.H{"error": "Failed to save MFA settings"})
				return
			}

			c.JSON(200, gin.H{"message": "MFA Enabled Successfully"})
		})

		authorized.POST("/create-user", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Admins only"})
				return
			}

			var input struct {
				Username   string `json:"username"`
				Password   string `json:"password"`
				Role       string `json:"role"`
				AllianceID int    `json:"allianceId"`
			}
			c.ShouldBindJSON(&input)

			hash, _ := auth.HashPassword(input.Password)
			if err := store.CreateUser(input.Username, hash, input.Role, input.AllianceID); err != nil {
				c.JSON(500, gin.H{"error": "Failed to create user"})
				return
			}
			c.JSON(200, gin.H{"message": "User created"})
		})

		authorized.GET("/jobs", func(c *gin.Context) {
			jobs, err := store.GetRecentJobs() // returns []JobResponse
			if err != nil {
				fmt.Printf("DB Error: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch jobs"})
				return
			}

			if jobs == nil {
				jobs = []db.JobResponse{}
			}
			c.JSON(http.StatusOK, jobs)
		})

		authorized.GET("/job/current", func(c *gin.Context) {
			progress := engine.Redis.GetCurrentJobStatus()

			isRunning := true
			if progress != nil {
				if progress.Status == "COMPLETED" || progress.Status == "FAILED" {
					isRunning = false
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"active": isRunning,
				"data":   progress,
			})
		})

		authorized.GET("/reports/:filename", func(c *gin.Context) {
			filename := c.Param("filename")

			if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
				return
			}

			targetPath := filepath.Join("reports", filename)

			if _, err := os.Stat(targetPath); os.IsNotExist(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
				return
			}

			c.Header("Content-Description", "File Transfer")
			c.Header("Content-Transfer-Encoding", "binary")
			c.Header("Content-Disposition", "attachment; filename="+filename)
			c.Header("Content-Type", "text/csv")
			c.File(targetPath)
		})

		authorized.GET("/war-room/stats", func(c *gin.Context) {
			stats, err := store.GetWarStats()
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to load stats"})
				return
			}
			c.JSON(200, stats)
		})

		authorized.POST("/war-room/deploy", func(c *gin.Context) {
			var input struct {
				PlayerIDs  []int64 `json:"playerIds" binding:"required"`
				AllianceID *int    `json:"allianceId"` // Null = Return to Reserve
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			err := store.BulkAssignFightingAlliance(input.PlayerIDs, input.AllianceID)
			if err != nil {
				c.JSON(500, gin.H{"error": "Deployment failed"})
				return
			}
			c.JSON(200, gin.H{"message": "Troops deployed successfully"})
		})

		authorized.POST("/war-room/lock", func(c *gin.Context) {
			var input struct {
				AllianceID int  `json:"allianceId"`
				IsLocked   bool `json:"isLocked"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			err := store.ToggleAllianceLock(input.AllianceID, input.IsLocked)
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to toggle lock"})
				return
			}
			c.JSON(200, gin.H{"message": "Lock updated"})
		})

		authorized.POST("/war-room/reset", func(c *gin.Context) {
			// Extra Security: Check if user is Admin
			if c.GetString("role") != "admin" {
				c.JSON(403, gin.H{"error": "Only Admins can reset the event"})
				return
			}

			if err := store.ResetEvent(); err != nil {
				c.JSON(500, gin.H{"error": "Reset failed"})
				return
			}
			c.JSON(200, gin.H{"message": "Event reset! All troops returned to reserve."})
		})

		authorized.GET("/squads/:allianceId", func(c *gin.Context) {
			aid, _ := strconv.Atoi(c.Param("allianceId"))
			squads, err := store.GetSquads(aid)
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to load squads"})
				return
			}
			c.JSON(200, squads)
		})

		authorized.POST("/squads/promote", func(c *gin.Context) {
			var input struct {
				FID        int64 `json:"fid"`
				AllianceID int   `json:"allianceId"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				return
			}
			store.PromoteCaptain(input.FID, input.AllianceID)
			c.JSON(200, gin.H{"message": "Squad created"})
		})

		authorized.POST("/squads/demote", func(c *gin.Context) {
			var input struct {
				TeamID int `json:"teamId"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				return
			}
			store.DemoteCaptain(input.TeamID)
			c.JSON(200, gin.H{"message": "Squad disbanded"})
		})

		authorized.POST("/squads/assign", func(c *gin.Context) {
			var input struct {
				FID    int64 `json:"fid"`
				TeamID *int  `json:"teamId"` // Null = Unassign
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				return
			}
			store.AssignToSquad(input.FID, input.TeamID)
			c.JSON(200, gin.H{"message": "Player moved"})
		})

		authorized.GET("/players", func(c *gin.Context) {
			username := c.GetString("username")
			user, _ := store.GetUserByUsername(username)

			var players []db.PlayerRow
			var err error

			if user.Role == "admin" {
				players, err = store.GetPlayers(nil)
			} else {
				if user.AllianceID == nil {
					players = []db.PlayerRow{}
				} else {
					players, err = store.GetPlayers(user.AllianceID)
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
		})

		authorized.PUT("/players/:fid", func(c *gin.Context) {
			fid, _ := strconv.ParseInt(c.Param("fid"), 10, 64)

			// Define the struct exactly as the Frontend sends it
			var input struct {
				Power              int64  `json:"power"`
				TroopType          string `json:"troopType"`
				BattleAvailability string `json:"battleAvailability"`
				TundraAvailability string `json:"tundraAvailability"`
				AllianceID         *int   `json:"allianceId"`         // Pointer allows nulls
				FightingAllianceID *int   `json:"fightingAllianceId"` // Pointer allows nulls
				TeamID             *int   `json:"teamId"`             // Pointer allows nulls
			}

			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": "Invalid input: " + err.Error()})
				return
			}

			// Call the DB function with arguments in the correct order (matching mysql.go)
			err := store.UpdatePlayerDetails(
				fid,
				input.Power,
				input.TroopType,
				input.BattleAvailability,
				input.TundraAvailability,
				input.AllianceID,
				input.FightingAllianceID,
				input.TeamID,
			)

			if err != nil {
				c.JSON(500, gin.H{"error": "Update failed"})
				return
			}
			c.JSON(200, gin.H{"message": "Player updated"})
		})

		authorized.GET("/war-room/filters", func(c *gin.Context) {
			opts, err := store.GetWarRoomFilterOptions()
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to fetch filter options"})
				return
			}
			c.JSON(200, opts)
		})

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
		admin.GET("/users", func(c *gin.Context) {
			users, err := store.GetAllUsers()
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to fetch users"})
				return
			}
			c.JSON(200, users)
		})

		admin.POST("/users", func(c *gin.Context) {
			var input struct {
				Username   string `json:"username" binding:"required"`
				Password   string `json:"password" binding:"required"`
				Role       string `json:"role" binding:"required"`
				AllianceID int    `json:"allianceId"`
			}

			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			existing, err := store.GetUserByUsername(input.Username)
			if err == nil && existing.ID != 0 {
				c.JSON(409, gin.H{"error": "Username already taken"})
				return
			}

			hash, _ := auth.HashPassword(input.Password)
			if err := store.CreateUser(input.Username, hash, input.Role, input.AllianceID); err != nil {
				c.JSON(500, gin.H{"error": "Failed to create user"})
				return
			}
			c.JSON(201, gin.H{"message": "User created successfully"})
		})

		admin.POST("/sync-roster", func(c *gin.Context) {
			playerIDs, err := store.GetAllPlayerIDs()
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
					info, err := engine.PlayerClient.GetPlayerInfo(fid)

					if err == nil && info.Code == 0 {
						store.UpsertPlayer(
							info.Data.Fid,
							info.Data.Nickname,
							info.Data.KID,
							info.Data.StoveLv,
							info.Data.StoveImg,
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
		})

		admin.DELETE("/users/:id", func(c *gin.Context) {
			idParam := c.Param("id")
			id, _ := strconv.Atoi(idParam)

			if id == 1 {
				c.JSON(http.StatusForbidden, gin.H{"error": "The master admin account cannot be deleted."})
				return
			}

			if err := store.DeleteUser(id); err != nil {
				c.JSON(500, gin.H{"error": "Failed to delete user"})
				return
			}
			logAction(c, store, "DELETE_USER", fmt.Sprintf("Deleted user ID: %d", id))
			c.JSON(200, gin.H{"message": "User deleted"})
		})

		rotation := authorized.Group("/rotation")
		{
			rotation.GET("/buildings", func(c *gin.Context) {
				buildings, err := store.GetAllBuildings()
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch buildings"})
					return
				}
				c.JSON(http.StatusOK, buildings)
			})

			rotation.GET("/schedule/:seasonId", func(c *gin.Context) {
				seasonId, _ := strconv.Atoi(c.Param("seasonId"))
				schedule, err := store.GetSeasonSchedule(seasonId)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch schedule"})
					return
				}
				c.JSON(http.StatusOK, schedule)
			})

			rotation.GET("/rewards/:week", func(c *gin.Context) {
				week, _ := strconv.Atoi(c.Param("week"))
				rewards, err := store.GetWeeklyRewards(week)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rewards"})
					return
				}
				c.JSON(http.StatusOK, rewards)
			})

			rotation.POST("/save", AdminOnlyMiddleware(), func(c *gin.Context) {
				var req struct {
					SeasonID int                `json:"seasonId"`
					Entries  []db.RotationEntry `json:"entries"`
				}

				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
					return
				}

				if err := store.SaveSeasonRotation(req.SeasonID, req.Entries); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				logAction(c, store, "UPDATE_ROTATION", fmt.Sprintf("Updated rotation for Season %d", req.SeasonID))
				c.JSON(http.StatusOK, gin.H{"message": "Rotation schedule updated successfully"})
			})
		}
		// --- DISCORD ENDPOINTS ---
		discord := authorized.Group("/discord")
		{
			discord.POST("/rotation/:seasonId/:week", func(c *gin.Context) {
				seasonId, _ := strconv.Atoi(c.Param("seasonId"))
				week, _ := strconv.Atoi(c.Param("week"))

				entries, err := store.GetRotationForWeek(seasonId, week)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rotation"})
					return
				}

				cfg, _ := config.LoadConfig()
				if err := services.SendDiscordRotation(cfg.Discord.WebhookURL, week, entries); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}

				logAction(c, store, "DISCORD", fmt.Sprintf("Announced Rotation S%d W%d", seasonId, week))
				c.JSON(http.StatusOK, gin.H{"message": "Rotation announced!"})
			})

			discord.POST("/announce", func(c *gin.Context) {
				var req struct {
					Title       string `json:"title"`
					Description string `json:"description"`
					Color       int    `json:"color"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
					return
				}

				cfg, _ := config.LoadConfig()
				if cfg.Discord.WebhookURL == "" {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Webhook not configured"})
					return
				}

				if err := services.SendCustomDiscordEmbed(cfg.Discord.WebhookURL, req.Title, req.Description, req.Color); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}

				logAction(c, store, "DISCORD", "Announced: "+req.Title)
				c.JSON(http.StatusOK, gin.H{"message": "Sent to Discord!"})
			})
		}
	}
	return r
}
