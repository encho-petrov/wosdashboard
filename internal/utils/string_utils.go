package utils

import (
	"regexp"
	"strings"
)

var invisibleCharsRegex = regexp.MustCompile(`[\x{2800}\x{200B}\x{200C}\x{200D}\x{FEFF}]+`)

// SanitizeNickname removes invisible Unicode characters and trims whitespace.
// Returns the sanitized string, and a boolean indicating if it's completely empty.
func SanitizeNickname(name string) (string, bool) {
	clean := invisibleCharsRegex.ReplaceAllString(name, "")
	clean = strings.TrimSpace(clean)
	return clean, clean == ""
}
