package utils

import (
	"testing"
)

func TestSanitizeNickname(t *testing.T) {
	tests := []struct {
		input       string
		expected    string
		expectEmpty bool
	}{
		{"Normal Name", "Normal Name", false},
		{"\u2800\u2800\u2800\u2800", "", true},
		{"\u200B\u200CGhost\u200D", "Ghost", false},
		{"   ", "", true},
		{"  Spaces  ", "Spaces", false},
	}

	for _, tc := range tests {
		actual, empty := SanitizeNickname(tc.input)
		if actual != tc.expected {
			t.Errorf("expected '%s' but got '%s'", tc.expected, actual)
		}
		if empty != tc.expectEmpty {
			t.Errorf("expected empty=%v but got %v", tc.expectEmpty, empty)
		}
	}
}
