package client

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type GiftClient struct {
	HttpClient *http.Client
	Secret     string
	BaseURL    string
}

func NewGiftClient(secret string) *GiftClient {
	return &GiftClient{
		HttpClient: &http.Client{Timeout: 20 * time.Second},
		Secret:     secret,
		BaseURL:    "https://wos-giftcode-api.centurygame.com",
	}
}

func (c *GiftClient) SetHttpClient(client *http.Client) {
	c.HttpClient = client
}

func (c *GiftClient) ComputeSignature(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	for i, k := range keys {
		sb.WriteString(k + "=" + params[k])
		if i < len(keys)-1 {
			sb.WriteString("&")
		}
	}
	sb.WriteString(c.Secret)

	hash := md5.Sum([]byte(sb.String()))
	return hex.EncodeToString(hash[:])
}

func (c *GiftClient) RedeemGift(fid, code, captcha string) (int, string, string, error) {
	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())

	params := map[string]string{
		"fid":          fid,
		"cdk":          code,
		"captcha_code": captcha,
		"time":         timestamp,
	}

	sign := c.ComputeSignature(params)

	body := fmt.Sprintf("sign=%s&fid=%s&cdk=%s&captcha_code=%s&time=%s",
		sign, fid, code, captcha, timestamp)

	req, err := http.NewRequest("POST", c.BaseURL+"/api/gift_code", strings.NewReader(body))
	if err != nil {
		return -1, "Request Creation Failed", "", err
	}

	for key, val := range GetRandomizedHeaders(c.BaseURL) {
		req.Header.Set(key, val)
	}

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return -1, "Network Error", "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return -1, "Read Error", "", err
	}

	responseStr := string(bodyBytes)

	if strings.Contains(responseStr, "<html") || strings.Contains(responseStr, "<!DOCTYPE") {
		return -1, "WAF_BLOCK", "", fmt.Errorf("WAF_BLOCK")
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &rawMap); err != nil {
		return -1, "JSON Parse Error", "", fmt.Errorf("json error: %v | Body: %s", err, responseStr)
	}

	finalCode := -999

	toInt := func(val interface{}) (int, bool) {
		switch v := val.(type) {
		case float64:
			return int(v), true
		case string:
			i, err := strconv.Atoi(v)
			return i, err == nil
		case int:
			return v, true
		}
		return 0, false
	}

	if val, ok := rawMap["code"]; ok {
		if i, ok := toInt(val); ok {
			finalCode = i
		}
	}
	if val, ok := rawMap["err_code"]; ok {
		if i, ok := toInt(val); ok {
			finalCode = i
		}
	}

	msg := ""
	if val, ok := rawMap["msg"]; ok {
		if s, ok := val.(string); ok {
			msg = s
		}
	}

	if finalCode == 0 || finalCode == 200 {
		nickname := ""
		if dataVal, ok := rawMap["data"]; ok {
			if dataMap, ok := dataVal.(map[string]interface{}); ok {
				if nickVal, ok := dataMap["nickname"]; ok {
					if nStr, ok := nickVal.(string); ok {
						nickname = nStr
					}
				}
			}
		}
		return 0, "SUCCESS", nickname, nil
	}

	if finalCode != 40008 && finalCode != 40014 {
		log.Printf("[GiftClient] API Response (Code: %d): %s", finalCode, responseStr)
	}

	return finalCode, msg, "", nil
}
