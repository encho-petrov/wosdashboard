package main

import (
	"database/sql"
	"fmt"
	"gift-redeemer/internal/config"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/nickalie/go-webpbin"

	_ "github.com/go-sql-driver/mysql"
	"github.com/gocolly/colly/v2"
	_ "golang.org/x/image/webp"
)

const (
	finalImageDir = "./shared-assets/heroes"
	tempImageDir  = "./shared-assets/heroes_temp"
	wikiURL       = "https://www.whiteoutsurvival.wiki/heroes/"
)

func main() {
	log.Println("Starting Hero Scraper...")

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Could not load config: %v", err)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true",
		cfg.Database.User, cfg.Database.Password, cfg.Database.Host, cfg.Database.DBName)

	os.RemoveAll(tempImageDir)
	if err := os.MkdirAll(tempImageDir, os.ModePerm); err != nil {
		log.Fatalf("Failed to create temp directory: %v", err)
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("DB Connection failed: %v", err)
	}
	defer db.Close()

	c := colly.NewCollector(
		colly.AllowedDomains("www.whiteoutsurvival.wiki"),
	)

	heroesScraped := 0

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

		fileName := fmt.Sprintf("%s.webp", strings.ToLower(strings.ReplaceAll(heroName, " ", "_")))

		localPath := filepath.Join(tempImageDir, fileName)

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
			heroesScraped++
		}
	})

	c.OnRequest(func(r *colly.Request) {
		log.Println("Visiting", r.URL.String())
	})

	c.Visit(wikiURL)

	if heroesScraped > 0 {
		log.Printf("Scraping completed (%d heroes). Syncing to shared Docker volume...\n", heroesScraped)

		tempFiles, err := os.ReadDir(tempImageDir)
		if err != nil {
			log.Printf("CRITICAL: Failed to read temp directory: %v", err)
			return
		}

		scrapedFileNames := make(map[string]bool)

		for _, f := range tempFiles {
			if f.IsDir() {
				continue
			}

			oldPath := filepath.Join(tempImageDir, f.Name())
			newPath := filepath.Join(finalImageDir, f.Name())

			if err := os.Rename(oldPath, newPath); err != nil {
				log.Printf("Error moving file %s: %v", f.Name(), err)
			} else {
				scrapedFileNames[f.Name()] = true
			}
		}

		liveFiles, _ := os.ReadDir(finalImageDir)
		for _, lf := range liveFiles {
			if !lf.IsDir() && !scrapedFileNames[lf.Name()] {
				orphanPath := filepath.Join(finalImageDir, lf.Name())
				err := os.Remove(orphanPath)
				if err != nil {
					return
				}
				log.Printf("Removed orphaned asset: %s", lf.Name())
			}
		}

		os.RemoveAll(tempImageDir)
		log.Println("Assets updated successfully! Backend cache invalidated.")

	} else {
		log.Println("No heroes found. Aborting sync to protect existing assets.")
		os.RemoveAll(tempImageDir)
	}
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

	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to decode source image: %v", err)
	}

	if err := webpbin.NewCWebP().
		Quality(75).
		InputImage(img).
		OutputFile(dest).
		Run(); err != nil {
		return fmt.Errorf("failed to encode webp: %v", err)
	}

	return nil
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
