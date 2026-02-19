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
	"gift-redeemer/internal/models"
	"gift-redeemer/internal/processor"
	"gift-redeemer/internal/services"
	"log"
	"strings"

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

func mapDayToCron(day string) string {
	days := map[string]string{
		"Sunday": "0", "Monday": "1", "Tuesday": "2",
		"Wednesday": "3", "Thursday": "4", "Friday": "5", "Saturday": "6",
	}
	if val, ok := days[day]; ok {
		return val
	}
	return "4"
}

func startDiscordWorker(store *db.Store, cfg models.DiscordConfig, seasonReferenceDate string) {
	c := cron.New()

	cronSpec := fmt.Sprintf("%s %s * * %s",
		strings.Split(cfg.AnnounceTimeUTC, ":")[1],
		strings.Split(cfg.AnnounceTimeUTC, ":")[0],
		mapDayToCron(cfg.AnnounceDay))

	c.AddFunc(cronSpec, func() {
		targetSeason, upcomingWeek := services.CalculateUpcomingWeek(seasonReferenceDate)

		entries, err := store.GetRotationForWeek(targetSeason, upcomingWeek)
		if err != nil {
			log.Printf("Error fetching rotation: %v", err)
			return
		}

		services.SendDiscordRotation(cfg, upcomingWeek, entries)
	})

	c.Start()
}

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Could not load config: %v", err)
	}

	auth.Init(cfg.ApiSecrets.JwtSecret)
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
		hash, _ := auth.HashPassword("admin123") // Change this!
		err := store.CreateUser("admin", hash, "admin", 0)
		if err != nil {
			return
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
	router := api.SetupRouter(engine, store, cfg.Game.TargetState, cfg.ApiSecrets.CaptchaApiKey)

	log.Println("Server running on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
