package client

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGiftClient_RedeemGift(t *testing.T) {
	secret := "test-secret"

	t.Run("Success Redemption", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "POST", r.Method)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"code": 0, "msg": "success", "data": {"nickname": "IceWarrior"}}`))
		}))
		defer server.Close()

		c := NewGiftClient(secret)
		c.BaseURL = server.URL // Point client to mock server

		code, msg, nickname, err := c.RedeemGift("12345", "GIFT2026", "captcha123")

		require.NoError(t, err)
		assert.Equal(t, 0, code)
		assert.Equal(t, "SUCCESS", msg)
		assert.Equal(t, "IceWarrior", nickname)
	})

	t.Run("Handle WAF Block", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte(`<html><head><title>403 Forbidden</title></head><body>WAF Blocked</body></html>`))
		}))
		defer server.Close()

		c := NewGiftClient(secret)
		c.BaseURL = server.URL

		code, msg, _, err := c.RedeemGift("12345", "GIFT", "cap")

		assert.Error(t, err)
		assert.Equal(t, -1, code)
		assert.Equal(t, "WAF_BLOCK", msg)
	})
}

func TestPlayerClient_GetPlayerInfo(t *testing.T) {
	secret := "player-secret"

	t.Run("Fetch Player Info Success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			// Mocking the structure expected by models.PlayerInfoResponse
			w.Write([]byte(`{
				"code": 0,
				"msg": "ok",
				"data": {
					"fid": 112233,
					"nickname": "Frosty",
					"kid": 391,
					"stove_lv": 30,
					"stove_img": "stove_30.png",
					"avatar": "avatar_1.png"
				}
			}`))
		}))
		defer server.Close()

		c := NewPlayerClient(secret)
		c.BaseURL = server.URL

		info, err := c.GetPlayerInfo(112233)

		require.NoError(t, err)
		assert.Equal(t, int64(112233), info.Data.Fid)
		assert.Equal(t, "Frosty", info.Data.Nickname)
		assert.Equal(t, 391, info.Data.KID)
	})
}

func TestPlayerClient_GetCaptcha(t *testing.T) {
	secret := "captcha-secret"

	t.Run("Handle Nested Captcha Data", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			// Testing the "Wrapper" format: {"code":0, "data": {"img": "base64..."}}
			w.Write([]byte(`{"code": 0, "msg": "ok", "data": {"img": "base64_image_data"}}`))
		}))
		defer server.Close()

		c := NewPlayerClient(secret)
		c.BaseURL = server.URL

		img, err := c.GetCaptcha(123)
		require.NoError(t, err)
		assert.Equal(t, "base64_image_data", img)
	})

	t.Run("Handle Direct String Captcha", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			// Testing the "Direct" format: {"code":0, "data": "base64..."}
			w.Write([]byte(`{"code": 0, "msg": "ok", "data": "direct_base64_string"}`))
		}))
		defer server.Close()

		c := NewPlayerClient(secret)
		c.BaseURL = server.URL

		img, err := c.GetCaptcha(123)
		require.NoError(t, err)
		assert.Equal(t, "direct_base64_string", img)
	})
}

func TestBrowserHeaders(t *testing.T) {
	t.Run("Headers Contain Required Security Fields", func(t *testing.T) {
		headers := GetRandomizedHeaders("https://test-origin.com")

		assert.NotEmpty(t, headers["user-agent"])
		assert.NotEmpty(t, headers["sec-ch-ua"])
		assert.Equal(t, "https://test-origin.com", headers["origin"])
		assert.Equal(t, "https://test-origin.com/", headers["referer"])
	})
}
