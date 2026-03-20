package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/db"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

var DiscordAPIBase = "https://discord.com/api/v10"

type DiscordEmbed struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Color       int    `json:"color,omitempty"`
}

type DiscordPayload struct {
	Content string         `json:"content,omitempty"`
	Embeds  []DiscordEmbed `json:"embeds,omitempty"`
}

func SendCustomDiscordEmbed(botToken, channelID, title, description string, color int, content string) error {

	payload := map[string]interface{}{
		"content": content,
		"allowed_mentions": map[string]interface{}{
			"parse": []string{"everyone", "roles", "users"},
		},
		"embeds": []map[string]interface{}{
			{
				"title":       title,
				"description": description,
				"color":       color,
			},
		},
	}

	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/channels/%s/messages", DiscordAPIBase, channelID)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bot "+botToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord API error: %d", resp.StatusCode)
	}
	return nil
}

func SendDiscordRotation(botToken, channelID string, season int, week int, entries []db.RotationEntryExtended, message string) error {
	description := ""
	for _, entry := range entries {
		alliance := entry.AllianceName
		if alliance == "" {
			alliance = "*Unassigned*"
		}
		description += fmt.Sprintf("🛡️ **%s %d** ➡️ %s\n", entry.BuildingType, entry.InternalID, alliance)
	}

	title := fmt.Sprintf("🏰 Season %d | Fortress Rotation: Week %d", season, week)

	return SendCustomDiscordEmbed(botToken, channelID, title, description, 3447003, message)
}

func SendMinistryManifest(botToken, channelID string, day *db.MinistryDay, slots []db.MinistrySlot) error {
	desc := fmt.Sprintf("Here is the schedule for tomorrow's **%s** buff.\n\n", day.BuffName)
	for _, s := range slots {
		timeLabel := fmt.Sprintf("%02d:%02d UTC", s.SlotIndex/2, (s.SlotIndex%2)*30)
		if s.PlayerFID != nil {
			desc += fmt.Sprintf("`%s` - **%s** [%s]\n", timeLabel, *s.Nickname, *s.AllianceName)
		} else {
			desc += fmt.Sprintf("`%s` - *[ Open Slot ]*\n", timeLabel)
		}
	}
	return SendCustomDiscordEmbed(botToken, channelID, "📅 Daily Ministry Schedule", desc, 10181046, "")
}

func SendMinistryPing(botToken, channelID, buffName, nickname, alliance string, pingStr string) error {
	title := fmt.Sprintf("🛠️ Ministry Buff Alert: %s", buffName)
	desc := fmt.Sprintf("Get ready! **%s** from [%s], your turn for the %s buff starts in exactly 5 minutes.",
		nickname, alliance, buffName)
	return SendCustomDiscordEmbed(botToken, channelID, title, desc, 15158332, pingStr)
}

func SendPetPing(botToken, channelID string, buffTime string, captains []db.CaptainBadge, pingStr string) error {
	title := "🐾 Pet Skill Activation Warning!"
	desc := fmt.Sprintf("The **%s** rotation begins in exactly 10 minutes.\n\n**Assigned Captains:**\n", buffTime)
	for _, captain := range captains {
		alliance := captain.AllianceName
		if alliance == nil {
			desc += fmt.Sprintf("🔸 **%s**\n", captain.Nickname)
		} else {
			desc += fmt.Sprintf("🔸 **%s** [%s]\n", captain.Nickname, *alliance)
		}
	}
	desc += "\n*Please ensure you are online and ready to activate your pet skills!*"
	return SendCustomDiscordEmbed(botToken, channelID, title, desc, 16753920, pingStr)
}

func SendDiscordImage(botToken, channelID string, imageBuf *bytes.Buffer, filename string, messageContent string) error {
	if botToken == "" || channelID == "" {
		return fmt.Errorf("bot token or channel ID missing")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	payloadData := map[string]interface{}{
		"content": messageContent,
		"allowed_mentions": map[string]interface{}{
			"parse": []string{"everyone", "roles", "users"},
		},
	}
	payloadBytes, _ := json.Marshal(payloadData)
	writer.WriteField("payload_json", string(payloadBytes))

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

	url := fmt.Sprintf("%s/channels/%s/messages", DiscordAPIBase, channelID)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bot "+botToken)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("discord API returned status: %d - %s", resp.StatusCode, string(bodyBytes))
	}
	return nil
}

func FormatDiscordPing(roleID *string) string {
	if roleID == nil || *roleID == "" {
		return ""
	}
	cleanRole := strings.TrimPrefix(*roleID, "@")
	if cleanRole == "everyone" || cleanRole == "here" {
		return "@" + cleanRole
	}
	return fmt.Sprintf("<@&%s>", cleanRole)
}
