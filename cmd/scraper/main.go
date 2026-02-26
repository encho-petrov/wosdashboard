package main

import (
	"database/sql"
	"fmt"
	"gift-redeemer/internal/config"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gocolly/colly/v2"
)

const (
	imageDir = "./shared-assets/heroes"
	wikiURL  = "https://www.whiteoutsurvival.wiki/heroes/"
)

func main() {
	log.Println("Starting Hero Scraper...")

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Could not load config: %v", err)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true",
		cfg.Database.User, cfg.Database.Password, cfg.Database.Host, cfg.Database.DBName)

	if err := os.MkdirAll(imageDir, os.ModePerm); err != nil {
		log.Fatalf("Failed to create image directory: %v", err)
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("DB Connection failed: %v", err)
	}
	defer db.Close()

	c := colly.NewCollector(
		colly.AllowedDomains("www.whiteoutsurvival.wiki"),
	)

	c.OnHTML("div.pet-card-item", func(e *colly.HTMLElement) {
		heroName := strings.TrimSpace(e.ChildText("h5.small-title a"))
		if heroName == "" {
			return
		}

		imgURL := e.ChildAttr("img.pet-image", "src")
		if imgURL == "" {
			return
		}

		troopType := "None"
		badgeURL := strings.ToLower(e.ChildAttr("div.vstack span.badge:nth-child(1) img", "src"))
		if strings.Contains(badgeURL, "infantry") {
			troopType = "Infantry"
		} else if strings.Contains(badgeURL, "lancer") {
			troopType = "Lancer"
		} else if strings.Contains(badgeURL, "marksman") {
			troopType = "Marksman"
		}

		fileName := fmt.Sprintf("%s.png", strings.ToLower(strings.ReplaceAll(heroName, " ", "_")))
		localPath := filepath.Join(imageDir, fileName)

		err := downloadImage(imgURL, localPath)
		if err != nil {
			log.Printf("Failed to download image for %s: %v\n", heroName, err)
			return
		}

		dbPath := fmt.Sprintf("/shared-assets/heroes/%s", fileName)
		err = upsertHero(db, heroName, troopType, imgURL, dbPath)
		if err != nil {
			log.Printf("Failed to save %s to DB: %v\n", heroName, err)
		} else {
			log.Printf("Synced: %-15s [%s]\n", heroName, troopType)
		}
	})

	c.OnRequest(func(r *colly.Request) {
		log.Println("Visiting", r.URL.String())
	})

	c.Visit(wikiURL)
	log.Println("Scraping completed.")
}

func downloadImage(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("bad status: %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func upsertHero(db *sql.DB, name, troopType, sourceURL, localPath string) error {
	query := `
		INSERT INTO heroes (name, troop_type, source_url, local_image_path) 
		VALUES (?, ?, ?, ?) 
		ON DUPLICATE KEY UPDATE 
			troop_type = VALUES(troop_type),
			source_url = VALUES(source_url), 
			local_image_path = VALUES(local_image_path)
	`
	_, err := db.Exec(query, name, troopType, sourceURL, localPath)
	return err
}
