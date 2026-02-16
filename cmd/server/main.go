package main

import (
	"gift-redeemer/internal/api"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/captcha"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/processor"
	"log"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Could not load config: %v", err)
	}

	auth.Init(cfg.ApiSecrets.JwtSecret)

	store, err := db.NewStore(
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.DBName,
	)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}

	_, err = store.GetUserByUsername("admin")
	if err != nil {
		hash, _ := auth.HashPassword("admin123") // Change this!
		store.CreateUser("admin", hash, "admin", 0)
		log.Println("Created default admin user: admin / admin123")
	}

	solver := captcha.NewSolver(cfg.ApiSecrets.CaptchaApiKey)
	defer solver.Close()

	pClient := client.NewPlayerClient(cfg.ApiSecrets.GiftSecret)
	gClient := client.NewGiftClient(cfg.ApiSecrets.GiftSecret)

	redisStore := cache.NewRedisStore(cfg.Redis.Host, cfg.Redis.Password, cfg.Redis.DB)
	engine := processor.NewProcessor(pClient, gClient, store, solver, redisStore)

	go engine.StartWorker()
	router := api.SetupRouter(engine, store, cfg.Game.TargetState)

	log.Println("Server running on http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
