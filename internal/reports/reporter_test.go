package reports

import (
	"encoding/csv"
	"gift-redeemer/internal/models"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExportJobResults(t *testing.T) {
	// 1. Prepare Mock Data covering all status mapping scenarios
	job := &models.RedeemJob{
		JobID: "TEST-JOB-999",
	}

	entries := []models.RedeemJobEntry{
		{PlayerId: 101, Nickname: "Alpha", RedeemStatus: 1, RedeemMsg: "OK"},
		{PlayerId: 102, Nickname: "Beta", RedeemStatus: -1, RedeemMsg: "CDK USED"},
		{PlayerId: 103, Nickname: "Gamma", RedeemStatus: -2, RedeemMsg: "Timeout"},
		{PlayerId: 104, Nickname: "Delta", RedeemStatus: 99, RedeemMsg: "Weird API Error"},
	}

	// 2. Execute the Export
	filename, err := ExportJobResults(job, entries)
	require.NoError(t, err)
	require.NotEmpty(t, filename)

	// Build the path to the newly created file
	filePath := filepath.Join("reports", filename)

	// Teardown: Ensure we delete the test file when the test finishes
	defer os.Remove(filePath)

	// 3. Verify the file actually exists on the disk
	_, err = os.Stat(filePath)
	assert.NoError(t, err, "The CSV file was not created on the disk")

	// 4. Read the file back out to verify its contents
	file, err := os.Open(filePath)
	require.NoError(t, err)
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	require.NoError(t, err)

	// We expect 1 Header Row + 4 Data Rows = 5 Rows total
	require.Len(t, records, 5)

	// Verify Header
	assert.Equal(t, []string{"Player ID", "Nickname", "Status", "Message"}, records[0])

	// Verify Status Map: 1 -> "Success"
	assert.Equal(t, []string{"101", "Alpha", "Success", "OK"}, records[1])

	// Verify Status Map: -1 -> "Failed/Used"
	assert.Equal(t, []string{"102", "Beta", "Failed/Used", "CDK USED"}, records[2])

	// Verify Status Map: -2 -> "Captcha Error"
	assert.Equal(t, []string{"103", "Gamma", "Captcha Error", "Timeout"}, records[3])

	// Verify Status Map: default -> "Unknown"
	assert.Equal(t, []string{"104", "Delta", "Unknown", "Weird API Error"}, records[4])
}
