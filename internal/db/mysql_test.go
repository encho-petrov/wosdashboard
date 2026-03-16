package db

import (
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJsonMarshallers(t *testing.T) {
	t.Run("JsonNullString", func(t *testing.T) {
		// 1. Test Valid String
		validStr := JsonNullString{sql.NullString{String: "test_string", Valid: true}}
		b, err := json.Marshal(validStr)
		require.NoError(t, err)
		assert.Equal(t, `"test_string"`, string(b))

		// 2. Test Null String
		nullStr := JsonNullString{sql.NullString{String: "", Valid: false}}
		b, err = json.Marshal(nullStr)
		require.NoError(t, err)
		assert.Equal(t, "null", string(b))
	})

	t.Run("JsonNullTime", func(t *testing.T) {
		// 1. Test Valid Time
		now := time.Now().Truncate(time.Second).UTC() // Truncate for clean JSON comparison
		validTime := JsonNullTime{sql.NullTime{Time: now, Valid: true}}
		b, err := json.Marshal(validTime)
		require.NoError(t, err)

		expectedJSON, _ := json.Marshal(now)
		assert.Equal(t, string(expectedJSON), string(b))

		// 2. Test Null Time
		nullTime := JsonNullTime{sql.NullTime{Time: time.Time{}, Valid: false}}
		b, err = json.Marshal(nullTime)
		require.NoError(t, err)
		assert.Equal(t, "null", string(b))
	})
}
