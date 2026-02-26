package services

import (
	"bytes"
	"fmt"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/db"
	"image"
	"image/jpeg"
	"log"

	"github.com/fogleman/gg"
	"github.com/nfnt/resize"
)

type MetaCardData struct {
	Type          string
	InfantryRatio int
	LancerRatio   int
	MarksmanRatio int
	LeadImages    []string
	JoinerImages  []string
}

type PetSlotDrawing struct {
	Captains []db.CaptainBadge
	YPos     float64
	Label    string
}

func GenerateMetaCard(data MetaCardData) (*bytes.Buffer, error) {
	const W = 800
	const H = 600

	dc := gg.NewContext(W, H)

	bgImage, err := gg.LoadImage("./shared-assets/backgrounds/meta_bg.jpg")
	if err == nil {
		dc.DrawImage(bgImage, 0, 0)
	} else {
		dc.SetHexColor("#1e2124") // Fallback color
		dc.Clear()
	}

	dc.SetRGBA(0, 0, 0, 0.6)
	dc.DrawRectangle(0, 0, W, H)
	dc.Fill()

	fontPath := "./shared-assets/fonts/Quivira.otf"
	drawShadowText := func(text string, x, y, size float64, color string) {
		if err := dc.LoadFontFace(fontPath, size); err != nil {
			log.Println("Missing font:", err)
			return
		}
		// Draw black shadow
		dc.SetHexColor("#000000")
		dc.DrawStringAnchored(text, x+2, y+2, 0.5, 0.5)
		// Draw actual text
		dc.SetHexColor(color)
		dc.DrawStringAnchored(text, x, y, 0.5, 0.5)
	}

	drawShadowText(fmt.Sprintf("%s Strategy Meta", data.Type), W/2, 60, 42, "#ffffff")

	ratios := fmt.Sprintf("Infantry: %d%%  |  Lancer: %d%%  |  Marksman: %d%%",
		data.InfantryRatio, data.LancerRatio, data.MarksmanRatio)
	drawShadowText(ratios, W/2, 110, 22, "#f1c40f")

	drawShadowText("MAIN CAPTAINS", W/2, 180, 20, "#a0aab5")
	drawHeroRow(dc, data.LeadImages, W/2, 260, 110) // Render at 110px

	drawShadowText("RALLY JOINERS", W/2, 380, 20, "#a0aab5")
	drawHeroRow(dc, data.JoinerImages, W/2, 450, 90) // Render at 90px

	buf := new(bytes.Buffer)
	err = jpeg.Encode(buf, dc.Image(), &jpeg.Options{Quality: 90})
	return buf, err
}

func drawHeroRow(dc *gg.Context, imagePaths []string, centerX, y, size int) {
	spacing := 30
	totalWidth := len(imagePaths) * (size + spacing)
	startX := centerX - (totalWidth / 2) + (size / 2) + (spacing / 2)

	for i, path := range imagePaths {
		img, err := gg.LoadImage(fmt.Sprintf(".%s", path))
		if err != nil {
			log.Printf("Failed to load hero image: %s", path)
			continue
		}

		img = resize.Resize(uint(size), uint(size), img, resize.Lanczos3)

		cx := float64(startX + (i * (size + spacing)))
		cy := float64(y)
		radius := float64(size) / 2

		dc.DrawCircle(cx, cy, radius)
		dc.Clip()

		dc.DrawImageAnchored(img, int(cx), int(cy), 0.5, 0.5)
		dc.ResetClip()

		dc.DrawCircle(cx, cy, radius)
		dc.SetHexColor("#f1c40f")
		dc.SetLineWidth(3)
		dc.Stroke()
	}
}

func GeneratePetScheduleCard(date string, scheduleData map[int][]db.CaptainBadge, rStore *cache.RedisStore) (*bytes.Buffer, error) {
	const W = 800
	const H = 750

	dc := gg.NewContext(W, H)

	bgImage, err := gg.LoadImage("./shared-assets/backgrounds/pet_bg.jpg")
	if err == nil {
		bgImage = resize.Resize(800, 750, bgImage, resize.Lanczos3)
		dc.DrawImage(bgImage, 0, 0)
	} else {
		dc.SetHexColor("#1e2124")
		dc.Clear()
	}

	dc.SetRGBA(0, 0, 0, 0.75)
	dc.DrawRectangle(0, 0, W, H)
	dc.Fill()

	fontPath := "./shared-assets/fonts/Quivira.otf"

	drawShadowText := func(text string, x, y, size float64, color string) {
		if err := dc.LoadFontFace(fontPath, size); err != nil {
			log.Println("Missing font:", err)
			return
		}
		dc.SetHexColor("#000000")
		dc.DrawStringAnchored(text, x+2, y+2, 0.5, 0.5)
		dc.SetHexColor(color)
		dc.DrawStringAnchored(text, x, y, 0.5, 0.5)
	}

	drawShadowText("RALLY LEAD PET ROTATION", W/2, 60, 38, "#FFD700")
	drawShadowText(fmt.Sprintf("Fight Date: %s", date), W/2, 105, 20, "#ffffff")

	slotLabels := map[int]string{
		1: "12:00 - 14:00 UTC",
		2: "14:00 - 16:00 UTC",
		3: "15:30 - 17:30 UTC",
	}

	ys := []int{240, 410, 580}

	for i := 1; i <= 3; i++ {
		y := ys[i-1]

		drawShadowText(slotLabels[i], 150, float64(y-75), 18, "#FFA500")

		captains := scheduleData[i]
		if len(captains) > 0 {
			drawPetRow(dc, captains, W/2, y, 75, rStore)
		} else {
			drawShadowText("No captains assigned", 160, float64(y), 16, "#555555")
		}
	}

	buf := new(bytes.Buffer)
	err = jpeg.Encode(buf, dc.Image(), &jpeg.Options{Quality: 90})
	return buf, err
}

func drawPetRow(dc *gg.Context, captains []db.CaptainBadge, centerX, y, size int, rStore *cache.RedisStore) {
	spacing := 40
	totalWidth := len(captains) * (size + spacing)
	startX := centerX - (totalWidth / 2) + (size / 2) + (spacing / 2)
	nameFont := "./shared-assets/fonts/noto.ttf"

	for i, captainBadge := range captains {
		var img image.Image
		if captainBadge.AvatarImage != nil && *captainBadge.AvatarImage != "" {
			img, _ = GetAvatarImage(rStore, captainBadge.Fid, *captainBadge.AvatarImage)
		}

		if img == nil {
			dc.SetHexColor("#2c3e50")
			dc.DrawCircle(float64(startX+(i*(size+spacing))), float64(y), float64(size)/2)
			dc.Fill()
		} else {
			img = resize.Resize(uint(size), uint(size), img, resize.Lanczos3)

			cx := float64(startX + (i * (size + spacing)))
			cy := float64(y)
			radius := float64(size) / 2

			dc.DrawCircle(cx, cy, radius)
			dc.Clip()

			dc.DrawImageAnchored(img, int(cx), int(cy), 0.5, 0.5)

			dc.ResetClip()
		}

		cx := float64(startX + (i * (size + spacing)))
		cy := float64(y)
		radius := float64(size) / 2

		dc.DrawCircle(cx, cy, radius)
		dc.SetHexColor("#f1c40f")
		dc.SetLineWidth(3)
		dc.Stroke()

		dc.SetHexColor("#ffffff")
		if err := dc.LoadFontFace(nameFont, 14); err != nil {
			dc.LoadFontFace("./shared-assets/fonts/Quivira.otf", 14)
		}
		dc.SetRGBA(0, 0, 0, 1.0)
		dc.DrawStringAnchored(captainBadge.Nickname, cx+1, cy+radius+23, 0.5, 0.5)
		// Draw main text
		dc.SetHexColor("#ffffff")
		dc.DrawStringAnchored(captainBadge.Nickname, cx, cy+radius+22, 0.5, 0.5)
	}
}
