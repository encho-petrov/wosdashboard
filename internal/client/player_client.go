package client

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"gift-redeemer/internal/models"
	"io"
	"net/http"
	"strings"
	"time"
)

type PlayerClient struct {
	HttpClient *http.Client
	Secret     string
	BaseURL    string
}

func NewPlayerClient(secret string) *PlayerClient {
	return &PlayerClient{
		HttpClient: &http.Client{Timeout: 15 * time.Second},
		Secret:     secret,
		BaseURL:    "https://wos-giftcode-api.centurygame.com",
	}
}

func (c *PlayerClient) GetHttpClient() *http.Client {
	return c.HttpClient
}

func (c *PlayerClient) ComputeSign(fid int64, timestamp int64) string {
	raw := fmt.Sprintf("fid=%d&time=%d%s", fid, timestamp, c.Secret)
	hash := md5.Sum([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func (c *PlayerClient) GetPlayerInfo(fid int64) (*models.PlayerInfoResponse, error) {
	timestamp := time.Now().UnixMilli()
	sign := c.ComputeSign(fid, timestamp)

	body := fmt.Sprintf("sign=%s&fid=%d&time=%d", sign, fid, timestamp)
	req, err := http.NewRequest("POST", c.BaseURL+"/api/player", strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	responseStr := string(bodyBytes)
	if strings.Contains(responseStr, "<html") || strings.Contains(responseStr, "<!DOCTYPE") {
		return nil, fmt.Errorf("WAF_BLOCK")
	}

	var result models.PlayerInfoResponse
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return nil, fmt.Errorf("parse error: %v | Body: %s", err, responseStr)
	}
	return &result, nil
}

func (c *PlayerClient) GetCaptcha(fid int64) (string, error) {
	timestamp := time.Now().UnixMilli()
	sign := c.ComputeSign(fid, timestamp)

	body := fmt.Sprintf("sign=%s&fid=%d&time=%d", sign, fid, timestamp)
	req, err := http.NewRequest("POST", c.BaseURL+"/api/captcha", strings.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	responseStr := string(bodyBytes)

	// 1. WAF Check
	if strings.Contains(responseStr, "<html") || strings.Contains(responseStr, "<!DOCTYPE") {
		return "", fmt.Errorf("WAF_BLOCK")
	}

	// 2. Parse Outer JSON
	var apiResponse struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}

	if err := json.Unmarshal(bodyBytes, &apiResponse); err != nil {
		return "", fmt.Errorf("JSON parse failed: %v", err)
	}

	if apiResponse.Code != 0 {
		return "", fmt.Errorf("api error %d: %s", apiResponse.Code, apiResponse.Msg)
	}

	// 3. FIX: Handle the Nested JSON Object {"img": "..."}
	// The logs showed: {"img":"data:image\/jpeg;base64..."}
	type CaptchaWrapper struct {
		Img string `json:"img"`
	}

	var wrapper CaptchaWrapper
	if err := json.Unmarshal(apiResponse.Data, &wrapper); err == nil && wrapper.Img != "" {
		return wrapper.Img, nil
	}

	// Fallback: Maybe it's a direct string? (Unlikely now, but safe to keep)
	var directString string
	if err := json.Unmarshal(apiResponse.Data, &directString); err == nil && directString != "" {
		return directString, nil
	}

	return "", fmt.Errorf("captcha data format error. RAW DATA: %s", string(apiResponse.Data))
}
