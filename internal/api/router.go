package api

import (
	"fmt"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/processor"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func SetupRouter(engine *processor.Processor, store *db.Store, targetState int) *gin.Engine {
	r := gin.Default()

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
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"}) // Don't say "User not found"
			return
		}

		if !auth.CheckPassword(input.Password, user.PasswordHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

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
	playerGroup.Use(AuthMiddleware())
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
			fid, _ := strconv.ParseInt(fidStr, 10, 64)

			data, err := store.GetPlayerDashboardData(fid)
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to load dashboard"})
				return
			}
			c.JSON(200, data)
		})
	}

	authorized := r.Group("/api/moderator")
	authorized.Use(AuthMiddleware())
	{
		authorized.POST("/redeem", func(c *gin.Context) {
			var input struct {
				GiftCodes []string `json:"giftCodes" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			username := c.GetString("username")
			user, err := store.GetUserByUsername(username)
			if err != nil {
				c.JSON(500, gin.H{"error": "User lookup failed"})
				return
			}

			jobID := fmt.Sprintf("JOB-%d", time.Now().Unix())

			if !engine.CanStartJob(jobID) {
				c.JSON(http.StatusConflict, gin.H{
					"error":  "A job is already running. Please wait for it to finish.",
					"status": "Running",
				})
				return
			}

			job := &models.RedeemJob{
				JobID:       jobID,
				GiftCodes:   input.GiftCodes,
				RequestedBy: c.GetHeader("X-API-Key"),
				UserID:      int64(user.ID),
				CreatedAt:   time.Now(),
				Status:      "Queued",
			}

			engine.JobQueue <- job
			c.JSON(http.StatusAccepted, gin.H{"jobId": job.JobID, "status": "Queued"})
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

		// Helper Data for Dropdowns
		authorized.GET("/options", func(c *gin.Context) {
			alliances, _ := store.GetAlliances()
			teams, _ := store.GetTeams()
			c.JSON(200, gin.H{"alliances": alliances, "teams": teams})
		})
	}

	admin := r.Group("/api/admin")
	admin.Use(AuthMiddleware())
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
			// 1. Get the list of IDs that need fixing
			ids, err := store.GetIncompletePlayers()
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to fetch incomplete records"})
				return
			}

			if len(ids) == 0 {
				c.JSON(200, gin.H{"message": "All players are already synced!"})
				return
			}

			// 2. Start Background Process
			go func(targetIDs []int64) {
				fmt.Printf("[SYNC] Starting sync for %d players...\n", len(targetIDs))

				for i, fid := range targetIDs {
					// A. Call Game API
					info, err := engine.PlayerClient.GetPlayerInfo(fid)

					// B. If successful, update DB
					if err == nil && info.Code == 0 {
						// Reuse our Upsert logic
						err := store.UpsertPlayer(
							info.Data.Fid,
							info.Data.Nickname,
							info.Data.KID,
							info.Data.StoveLv,
							info.Data.StoveImg,
							info.Data.Avatar,
						)
						if err != nil {
							fmt.Printf("[SYNC] Failed to save FID %d: %v\n", fid, err)
						} else {
							fmt.Printf("[SYNC] Fixed %d/%d: %s\n", i+1, len(targetIDs), info.Data.Nickname)
						}
					} else {
						fmt.Printf("[SYNC] API Error for FID %d\n", fid)
					}

					// C. Rate Limiting (VERY IMPORTANT)
					// Sleep 200ms to avoid getting banned by WOS API
					time.Sleep(500 * time.Millisecond)
				}
				fmt.Println("[SYNC] Completed.")
			}(ids)

			c.JSON(200, gin.H{"message": fmt.Sprintf("Started background sync for %d players. Check logs for progress.", len(ids))})
		})

		admin.DELETE("/users/:id", func(c *gin.Context) {
			idParam := c.Param("id")
			id, _ := strconv.Atoi(idParam)

			if err := store.DeleteUser(id); err != nil {
				c.JSON(500, gin.H{"error": "Failed to delete user"})
				return
			}
			c.JSON(200, gin.H{"message": "User deleted"})
		})
	}
	return r
}
