package main

import (
	"context"
	"database/sql"
	"errors"
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
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
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

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
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

	botToken := cfg.Discord.BotToken

	var cronManager *services.CronManager
	if botToken != "" {
		cronManager = services.NewCronManager(store, botToken)
		cronManager.Start()
		defer cronManager.Stop()
	} else {
		log.Println("WARNING: Discord Bot Token missing. Dynamic Cron Engine disabled.")
	}

	router := api.SetupRouter(engine, store, cfg, pClient, redisStore, cronManager)

	var sysCron *cron.Cron
	if botToken != "" {
		sysCron = cron.New(cron.WithLocation(time.UTC))

		cronExp := parseCronSchedule(cfg.Rotation.AnnounceDay, cfg.Rotation.AnnounceTimeUTC)
		_, err := sysCron.AddFunc(cronExp, func() {
			log.Println("CRON: Triggering automated Discord rotation announcement...")
			services.TriggerRotationCron(store, botToken, cfg.Rotation.SeasonReferenceDate, cfg.Rotation.AnchorSeason)
		})

		_, err = sysCron.AddFunc("* * * * *", func() {
			services.CheckMinistrySchedule(store, botToken)
			services.CheckPetSchedule(store, botToken)
		})

		if err != nil {
			log.Printf("Failed to schedule System Discord cron: %v", err)
		} else {
			sysCron.Start()
			log.Printf("System Discord Cron scheduled for %s at %s UTC", cfg.Rotation.AnnounceDay, cfg.Rotation.AnnounceTimeUTC)
		}
	}
	srv := &http.Server{
		Addr:    ":8080",
		Handler: router,
	}

	go func() {
		log.Println("Server running on http://localhost:8080")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	<-quit
	log.Println("Shutdown signal received. Initiating graceful shutdown sequence...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Cleaning up background workers and connections...")

	if cronManager != nil {
		cronManager.Stop()
	}

	if sysCron != nil {
		stopCtx := sysCron.Stop()
		<-stopCtx.Done()
		log.Println("System Crons stopped.")
	}

	if err := store.Close(); err != nil {
		log.Printf("Error closing MySQL connection: %v", err)
	} else {
		log.Println("MySQL connection closed.")
	}

	if err := redisStore.Close(); err != nil {
		log.Printf("Error closing Redis connection: %v", err)
	} else {
		log.Println("Redis connection closed.")
	}

	log.Println("✅ Server exited cleanly.")
}
