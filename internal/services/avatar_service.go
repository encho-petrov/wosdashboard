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

	if rStore != nil && rStore.Client != nil {
		data, err := rStore.Client.Get(ctx, cacheKey).Bytes()
		if err == nil {
			img, _, decodeErr := image.Decode(bytes.NewReader(data))
			if decodeErr == nil {
				return img, nil
			}
		}
	}

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch failed with status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read body: %w", err)
	}
	if rStore != nil && rStore.Client != nil {
		rStore.Client.Set(ctx, cacheKey, body, 24*time.Hour)
	}

	img, _, err := image.Decode(bytes.NewReader(body))
	return img, err
}
