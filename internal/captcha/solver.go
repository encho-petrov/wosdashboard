package captcha

import (
	"encoding/json"
	"fmt"
	"io"
	"log" // Changed to log for immediate output
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Solver struct {
	ApiKey string
	Client *http.Client
}

func NewSolver(apiKey string) *Solver {
	return &Solver{
		ApiKey: apiKey,
		Client: &http.Client{Timeout: 60 * time.Second},
	}
}

type twoCaptchaResponse struct {
	Status  int    `json:"status"`
	Request string `json:"request"`
}

func (s *Solver) Solve(base64Image string) (string, error) {
	if strings.Contains(base64Image, ",") {
		base64Image = strings.Split(base64Image, ",")[1]
	}

	log.Println("[Solver] Sending image to 2Captcha...")
	startTime := time.Now()

	submitUrl := "http://2captcha.com/in.php"
	data := url.Values{}
	data.Set("key", s.ApiKey)
	data.Set("method", "base64")
	data.Set("body", base64Image)
	data.Set("json", "1")
	data.Set("regsense", "1")
	data.Set("numeric", "4")

	resp, err := s.Client.PostForm(submitUrl, data)
	if err != nil {
		log.Printf("[Solver] HTTP Post Failed: %v", err)
		return "", err
	}
	defer resp.Body.Close()

	var submitResp twoCaptchaResponse
	if err := json.NewDecoder(resp.Body).Decode(&submitResp); err != nil {
		log.Printf("[Solver] JSON Decode Failed: %v", err)
		return "", err
	}

	if submitResp.Status != 1 {
		log.Printf("[Solver] API Error: %s (Check your API Key!)", submitResp.Request)
		return "", fmt.Errorf("2captcha error: %s", submitResp.Request)
	}

	captchaID := submitResp.Request
	log.Printf("[Solver] Job ID: %s. Waiting...", captchaID)

	// Poll for result
	// Wait 5s first to be faster (some captchas are solved quickly)
	time.Sleep(5 * time.Second)

	for i := 0; i < 30; i++ { // Increase attempts to 30 (60 seconds max)
		solveUrl := fmt.Sprintf("http://2captcha.com/res.php?key=%s&action=get&id=%s&json=1", s.ApiKey, captchaID)
		resp, err := s.Client.Get(solveUrl)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var solveResp twoCaptchaResponse
		if err := json.Unmarshal(bodyBytes, &solveResp); err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		if solveResp.Status == 1 {
			duration := time.Since(startTime)
			log.Printf("[Solver] SOLVED: %s (Took %s)", solveResp.Request, duration)
			return solveResp.Request, nil
		}

		if solveResp.Request == "CAPCHA_NOT_READY" {
			// Don't log this every time, it spams the console
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("[Solver] Polling Error: %s", solveResp.Request)
		return "", fmt.Errorf("2captcha error: %s", solveResp.Request)
	}

	return "", fmt.Errorf("timeout waiting for solution")
}

func (s *Solver) Close()                                                   {}
func (s *Solver) SaveDebugImage(base64Image string, filename string) error { return nil }
