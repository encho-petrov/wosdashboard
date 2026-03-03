package main

import (
	"database/sql"
	"fmt"
	"gift-redeemer/internal/api"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/captcha"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/processor"
	"gift-redeemer/internal/services"
	"log"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/robfig/cron/v3"
)

func runMigrations(baseDSN string) error {
	migrationDSN := baseDSN
	if strings.Contains(baseDSN, "?") {
		migrationDSN += "&multiStatements=true"
	} else {
		migrationDSN += "?multiStatements=true"
	}

	mDB, err := sql.Open("mysql", migrationDSN)
	if err != nil {
		return fmt.Errorf("could not open migration connection: %v", err)
	}
	defer mDB.Close()

	driver, err := mysql.WithInstance(mDB, &mysql.Config{})
	if err != nil {
		return fmt.Errorf("migration driver error: %v", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"mysql",
		driver,
	)
	if err != nil {
		return fmt.Errorf("migration instance error: %v", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migration failed: %v", err)
	}

	log.Println("✅ Database migrations applied successfully!")
	return nil
}

func parseCronSchedule(day string, timeStr string) string {
	days := map[string]string{
		"Sunday": "0", "Monday": "1", "Tuesday": "2",
		"Wednesday": "3", "Thursday": "4", "Friday": "5", "Saturday": "6",
	}

	dayNum, ok := days[day]
	if !ok {
		dayNum = "4"
	}

	parts := strings.Split(timeStr, ":")
	hour, m := "12", "00"
	if len(parts) == 2 {
		hour = parts[0]
		m = parts[1]
	}

	return fmt.Sprintf("%s %s * * %s", m, hour, dayNum)
}

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Could not load config: %v", err)
	}

	auth.Init(cfg)

	err = auth.InitWebAuthn(cfg.BioID.ApplicationName, cfg.BioID.ApplicationDomain, cfg.BioID.ApplicationURL)
	if err != nil {
		log.Fatalf("Could not init web authn: %v", err)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true",
		cfg.Database.User, cfg.Database.Password, cfg.Database.Host, cfg.Database.DBName)

	store, err := db.NewStore(
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.DBName,
	)

	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}

	if err := runMigrations(dsn); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	_, err = store.GetUserByUsername("admin")
	if err != nil {
		hash, _ := auth.HashPassword("admin123")
		err := store.CreateUser("admin", hash, "admin", 0)
		if err != nil {
			log.Fatalf("FATAL: Failed to create default admin user: %v", err)
		}
		log.Println("Created default admin user: admin / admin123")
	}

	solver := captcha.NewSolver(cfg.ApiSecrets.CaptchaApiKey)
	defer solver.Close()

	pClient := client.NewPlayerClient(cfg.ApiSecrets.GiftSecret)
	gClient := client.NewGiftClient(cfg.ApiSecrets.GiftSecret)

	redisStore := cache.NewRedisStore(cfg.Redis.Host, cfg.Redis.Password, cfg.Redis.DB)
	engine := processor.NewProcessor(pClient, gClient, store, solver, redisStore)

	go engine.StartWorkers()
	router := api.SetupRouter(engine, store, cfg, pClient, redisStore)

	if cfg.Discord.WebhookURL != "" {
		c := cron.New(cron.WithLocation(time.UTC))

		cronExp := parseCronSchedule(cfg.Rotation.AnnounceDay, cfg.Rotation.AnnounceTimeUTC)

		// Fortress rotation cron
		_, err := c.AddFunc(cronExp, func() {
			log.Println("CRON: Triggering automated Discord rotation announcement...")

			cfg, _ := config.LoadConfig()
			liveSeason, liveWeek := services.GetRotationState(cfg.Rotation.SeasonReferenceDate, cfg.Rotation.AnchorSeason)

			entries, err := store.GetRotationForWeek(liveSeason, liveWeek)
			if err != nil || len(entries) == 0 {
				log.Printf("CRON: No rotation data found for S%d W%d. Skipping announcement.", liveSeason, liveWeek)
				return
			}

			if err := services.SendDiscordRotation(cfg.Discord.WebhookURL, liveSeason, liveWeek, entries); err != nil {
				log.Printf("CRON Error: %v", err)
			}
		})

		// Ministry reservations cron
		_, err = c.AddFunc("* * * * *", func() {
			services.CheckMinistrySchedule(store, cfg.Discord.WebhookURL)
			services.CheckPetSchedule(store, cfg.Discord.WebhookURL)
		})

		if err != nil {
			log.Printf("Failed to schedule Discord cron: %v", err)
		} else {
			c.Start()
			log.Printf("Discord Rotation Cron scheduled for %s at %s UTC", cfg.Rotation.AnnounceDay, cfg.Rotation.AnnounceTimeUTC)
		}
		defer c.Stop()
	}

	log.Println("Server running on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
