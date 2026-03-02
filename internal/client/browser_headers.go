package client

import (
	"fmt"
	"math/rand"
)

type Platform struct {
	OS          string
	SecPlatform string
}

type BrowserProfile struct {
	Browser   string
	Versions  []int
	Platforms []Platform
}

var browserProfiles = []BrowserProfile{
	{
		Browser:  "Chrome",
		Versions: []int{124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135},
		Platforms: []Platform{
			{OS: "Windows NT 10.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Windows NT 11.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Macintosh; Intel Mac OS X 10_15_7", SecPlatform: `"macOS"`},
			{OS: "X11; Linux x86_64", SecPlatform: `"Linux"`},
		},
	},
	{
		Browser:  "Brave",
		Versions: []int{132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145},
		Platforms: []Platform{
			{OS: "Windows NT 10.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Windows NT 11.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Macintosh; Intel Mac OS X 10_15_7", SecPlatform: `"macOS"`},
		},
	},
	{
		Browser:  "Edge",
		Versions: []int{124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135},
		Platforms: []Platform{
			{OS: "Windows NT 10.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Windows NT 11.0; Win64; x64", SecPlatform: `"Windows"`},
			{OS: "Macintosh; Intel Mac OS X 10_15_7", SecPlatform: `"macOS"`},
		},
	},
}

func buildSecUA(browser string, version int) string {
	switch browser {
	case "Chrome":
		return fmt.Sprintf(`"Not:A-Brand";v="99", "Google Chrome";v="%d", "Chromium";v="%d"`, version, version)
	case "Brave":
		return fmt.Sprintf(`"Not:A-Brand";v="99", "Brave";v="%d", "Chromium";v="%d"`, version, version)
	case "Edge":
		return fmt.Sprintf(`"Not A(B)rand";v="8", "Chromium";v="%d", "Microsoft Edge";v="%d"`, version, version)
	default:
		return ""
	}
}

func GetRandomizedHeaders(origin string) map[string]string {
	profile := browserProfiles[rand.Intn(len(browserProfiles))]
	version := profile.Versions[rand.Intn(len(profile.Versions))]
	platform := profile.Platforms[rand.Intn(len(profile.Platforms))]

	userAgent := fmt.Sprintf("Mozilla/5.0 (%s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%d.0.0.0 Safari/537.36", platform.OS, version)
	secChUa := buildSecUA(profile.Browser, version)

	headers := map[string]string{
		"accept":             "application/json, text/plain, */*",
		"accept-encoding":    "gzip, deflate, br, zstd",
		"accept-language":    "en-US,en;q=0.9",
		"content-type":       "application/x-www-form-urlencoded",
		"priority":           "u=1, i",
		"user-agent":         userAgent,
		"sec-ch-ua":          secChUa,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": platform.SecPlatform,
		"sec-fetch-dest":     "empty",
		"sec-fetch-mode":     "cors",
		"sec-fetch-site":     "same-site",
		"sec-gpc":            "1",
	}

	if origin != "" {
		headers["origin"] = origin
		headers["referer"] = origin + "/"
	}

	return headers
}
