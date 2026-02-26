package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/db"
	"mime/multipart"
	"net/http"
)

type DiscordEmbed struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       int    `json:"color"`
}

type DiscordPayload struct {
	Content string         `json:"content"`
	Embeds  []DiscordEmbed `json:"embeds"`
}

func SendCustomDiscordEmbed(webhookURL, title, description string, color int) error {
	if webhookURL == "" {
		return fmt.Errorf("discord webhook URL is empty")
	}

	payload := DiscordPayload{
		Embeds: []DiscordEmbed{{Title: title, Description: description, Color: color}},
	}

	jsonPayload, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord API returned status: %d", resp.StatusCode)
	}
	return nil
}

func SendDiscordRotation(webhookURL string, season int, week int, entries []db.RotationEntryExtended) error {
	description := ""
	for _, entry := range entries {
		alliance := entry.AllianceName
		if alliance == "" {
			alliance = "*Unassigned*"
		}
		description += fmt.Sprintf("🛡️ **%s %d** ➡️ %s\n", entry.BuildingType, entry.InternalID, alliance)
	}

	title := fmt.Sprintf("🏰 Season %d | Fortress Rotation: Week %d", season, week)
	return SendCustomDiscordEmbed(webhookURL, title, description, 3447003)
}

func SendMinistryManifest(webhookURL string, day *db.MinistryDay, slots []db.MinistrySlot) error {
	desc := fmt.Sprintf("Here is the schedule for tomorrow's **%s** buff.\n\n", day.BuffName)
	for _, s := range slots {
		timeLabel := fmt.Sprintf("%02d:%02d UTC", s.SlotIndex/2, (s.SlotIndex%2)*30)
		if s.PlayerFID != nil {
			desc += fmt.Sprintf("`%s` - **%s** [%s]\n", timeLabel, *s.Nickname, *s.AllianceName)
		} else {
			desc += fmt.Sprintf("`%s` - *[ Open Slot ]*\n", timeLabel)
		}
	}
	return SendCustomDiscordEmbed(webhookURL, "📅 Daily Ministry Schedule", desc, 10181046)
}

func SendMinistryPing(webhookURL string, buffName, nickname, alliance string) error {
	title := fmt.Sprintf("🛠️ Ministry Buff Alert: %s", buffName)
	desc := fmt.Sprintf("Get ready! **%s** from [%s], your turn for the %s buff starts in exactly 5 minutes.",
		nickname, alliance, buffName)

	return SendCustomDiscordEmbed(webhookURL, title, desc, 15158332)
}

func SendPetPing(webhookURL string, buffTime string, captains []db.CaptainBadge) error {
	title := "🐾 Pet Skill Activation Warning!"

	desc := fmt.Sprintf("The **%s** rotation begins in exactly 10 minutes.\n\n**Assigned Captains:**\n", buffTime)

	for _, cap := range captains {
		alliance := cap.AllianceName
		if alliance == nil {
			desc += fmt.Sprintf("🔸 **%s**\n", cap.Nickname)
		} else {
			desc += fmt.Sprintf("🔸 **%s** [%s]\n", cap.Nickname, *alliance)
		}
	}

	desc += "\n*Please ensure you are online and ready to activate your pet skills!*"

	return SendCustomDiscordEmbed(webhookURL, title, desc, 16753920)
}

func SendDiscordImage(webhookURL string, imageBuf *bytes.Buffer, filename string, messageContent string) error {
	if webhookURL == "" {
		return fmt.Errorf("discord webhook URL is empty")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	_ = writer.WriteField("content", messageContent)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return err
	}
	_, err = part.Write(imageBuf.Bytes())
	if err != nil {
		return err
	}

	err = writer.Close()
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", webhookURL, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord API returned status: %d", resp.StatusCode)
	}

	return nil
}
