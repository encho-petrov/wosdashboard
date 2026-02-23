package reports

import (
	"encoding/csv"
	"fmt"
	"gift-redeemer/internal/models"
	"os"
	"time"
)

func ExportJobResults(job *models.RedeemJob, entries []models.RedeemJobEntry) (string, error) {
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	folder := "reports"
	filename := fmt.Sprintf("report_%s_%s.csv", job.JobID, timestamp)

	file, err := os.Create(folder + "/" + filename)
	if err != nil {
		return "", fmt.Errorf("could not create file: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	header := []string{"Player ID", "Nickname", "Status", "Message"}
	if err := writer.Write(header); err != nil {
		return "", err
	}

	for _, entry := range entries {
		row := []string{
			fmt.Sprintf("%d", entry.PlayerId),
			entry.Nickname,
			mapStatus(entry.RedeemStatus),
			entry.RedeemMsg,
		}
		if err := writer.Write(row); err != nil {
			return "", err
		}
	}

	return filename, nil
}

func mapStatus(status int) string {
	switch status {
	case 1:
		return "Success"
	case -1:
		return "Failed/Used"
	case -2:
		return "Captcha Error"
	default:
		return "Unknown"
	}
}
