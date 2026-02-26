package services

import (
	"bytes"
	"context"
	"fmt"
	"gift-redeemer/internal/cache"
	"image"
	"io"
	"net/http"
	"time"
)

func GetAvatarImage(rStore *cache.RedisStore, playerID int64, url string) (image.Image, error) {
	ctx := context.Background()
	cacheKey := fmt.Sprintf("avatar_cache:%d", playerID)

	// 1. Check Redis Store
	if rStore != nil && rStore.Client != nil {
		data, err := rStore.Client.Get(ctx, cacheKey).Bytes()
		if err == nil {
			img, _, decodeErr := image.Decode(bytes.NewReader(data))
			if decodeErr == nil {
				return img, nil
			}
		}
	}

	// 2. Fetch from URL
	resp, err := http.Get(url)
	if err != nil || resp.StatusCode != 200 {
		return nil, fmt.Errorf("fetch failed")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// 3. Cache it
	if rStore != nil && rStore.Client != nil {
		rStore.Client.Set(ctx, cacheKey, body, 24*time.Hour)
	}

	img, _, err := image.Decode(bytes.NewReader(body))
	return img, err
}
