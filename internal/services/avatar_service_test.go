package services

import (
	"context"
	"gift-redeemer/internal/cache"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "image/png" // Blank import needed for image.Decode to recognize PNGs

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A tiny 1x1 pixel transparent PNG to satisfy image.Decode
var tinyPNG = []byte{
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
	0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0,
	0, 0, 11, 73, 68, 65, 84, 8, 215, 99, 96, 0, 2, 0, 0, 5, 0, 1,
	226, 38, 5, 155, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
}

func setupMockRedis(t *testing.T) (*cache.RedisStore, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	store := cache.NewRedisStore(mr.Addr(), "", 0)
	return store, mr
}

func TestGetAvatarImage(t *testing.T) {
	rStore, mr := setupMockRedis(t)
	defer mr.Close()

	t.Run("Cache Miss - Successful HTTP Fetch", func(t *testing.T) {
		// 1. Setup Mock Image Server
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			w.Write(tinyPNG)
		}))
		defer server.Close()

		playerID := int64(111)

		// 2. Fetch the image
		img, err := GetAvatarImage(rStore, playerID, server.URL)
		require.NoError(t, err)
		require.NotNil(t, img)
		assert.Equal(t, 1, img.Bounds().Dx(), "Image width should be 1px")

		// 3. Verify it was saved to Redis
		ctx := context.Background()
		cachedData, err := rStore.Client.Get(ctx, "avatar_cache:111").Bytes()
		require.NoError(t, err, "Image should be cached in Redis")
		assert.Equal(t, tinyPNG, cachedData)
	})

	t.Run("Cache Hit - Skips HTTP Fetch", func(t *testing.T) {
		playerID := int64(222)
		cacheKey := "avatar_cache:222"

		// 1. Pre-populate Redis with our tiny PNG
		ctx := context.Background()
		rStore.Client.Set(ctx, cacheKey, tinyPNG, 0)

		// 2. We provide an invalid URL. If it tries to fetch via HTTP, it will panic/fail.
		// Because it's a cache hit, it should completely ignore the URL.
		badURL := "http://invalid-url-that-does-not-exist"

		img, err := GetAvatarImage(rStore, playerID, badURL)

		require.NoError(t, err)
		require.NotNil(t, img)
		assert.Equal(t, 1, img.Bounds().Dx())
	})

	t.Run("HTTP Failure Handling", func(t *testing.T) {
		// Mock server returning 404 Not Found
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		playerID := int64(333)
		img, err := GetAvatarImage(rStore, playerID, server.URL)

		assert.Error(t, err)
		assert.Nil(t, img)
		assert.Contains(t, err.Error(), "fetch failed with status: 404")
	})

	t.Run("Invalid Image Format Handling", func(t *testing.T) {
		// Mock server returning invalid text data instead of an image
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("this is not a valid png file"))
		}))
		defer server.Close()

		playerID := int64(444)
		img, err := GetAvatarImage(rStore, playerID, server.URL)

		assert.Error(t, err)
		assert.Nil(t, img)
		assert.Contains(t, err.Error(), "unknown format")
	})
}
