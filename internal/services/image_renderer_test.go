package services

import (
	"bytes"
	"gift-redeemer/internal/db"
	"image/jpeg"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateMetaCard(t *testing.T) {
	t.Run("Generates Valid JPEG", func(t *testing.T) {
		data := MetaCardData{
			Type:          "SvS Attack",
			InfantryRatio: 40,
			LancerRatio:   30,
			MarksmanRatio: 30,
			LeadImages:    []string{"/fake/path1.png", "/fake/path2.png"},
			JoinerImages:  []string{"/fake/path3.png"},
		}

		// Execute generator
		buf, err := GenerateMetaCard(data)

		// 1. Ensure no execution errors
		require.NoError(t, err)
		require.NotNil(t, buf)
		assert.Greater(t, buf.Len(), 0, "Buffer should not be empty")

		// 2. Ensure the output is a valid JPEG
		img, err := jpeg.Decode(bytes.NewReader(buf.Bytes()))
		require.NoError(t, err, "Output should be a decodable JPEG")

		// 3. Verify Dimensions (W: 800, H: 600)
		assert.Equal(t, 800, img.Bounds().Dx())
		assert.Equal(t, 600, img.Bounds().Dy())
	})
}

func TestGeneratePetScheduleCard(t *testing.T) {
	t.Run("Generates Valid JPEG with Missing Avatars", func(t *testing.T) {
		// Mock Data
		fakeURL := "http://invalid-url-for-test.com/avatar.png"
		scheduleData := map[int][]db.CaptainBadge{
			1: {
				{Fid: 111, Nickname: "Alpha", AvatarImage: &fakeURL},
				{Fid: 222, Nickname: "Beta"}, // Testing nil avatar
			},
			2: {}, // Testing empty slot
			3: {
				{Fid: 333, Nickname: "Gamma", AvatarImage: &fakeURL},
			},
		}

		// Execute generator. We can pass nil for Redis since GetAvatarImage handles it safely.
		buf, err := GeneratePetScheduleCard("2026-03-18", scheduleData, nil)

		// 1. Ensure no execution errors
		require.NoError(t, err)
		require.NotNil(t, buf)
		assert.Greater(t, buf.Len(), 0)

		// 2. Ensure the output is a valid JPEG
		img, err := jpeg.Decode(bytes.NewReader(buf.Bytes()))
		require.NoError(t, err)

		// 3. Verify Dimensions (W: 800, H: 750)
		assert.Equal(t, 800, img.Bounds().Dx())
		assert.Equal(t, 750, img.Bounds().Dy())
	})
}
