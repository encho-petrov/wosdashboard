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

	for key, val := range GetRandomizedHeaders(c.BaseURL) {
		req.Header.Set(key, val)
	}

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

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		return nil, fmt.Errorf("parse error: %v | Body: %s", err, responseStr)
	}

	result := &models.PlayerInfoResponse{}

	if codeBytes, ok := raw["code"]; ok {
		json.Unmarshal(codeBytes, &result.Code)
	} else if errCodeBytes, ok := raw["err_code"]; ok {
		json.Unmarshal(errCodeBytes, &result.Code)
	}

	if msgBytes, ok := raw["msg"]; ok {
		json.Unmarshal(msgBytes, &result.Msg)
	}

	if dataBytes, ok := raw["data"]; ok && string(dataBytes) != "[]" && string(dataBytes) != "null" {
		json.Unmarshal(dataBytes, &result.Data)
	}

	return result, nil
}
