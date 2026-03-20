package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type DiscordStateClaims struct {
	AllianceID *int `json:"allianceId"`
	jwt.RegisteredClaims
}

func GenerateDiscordState(allianceID *int, secret string) (string, error) {
	claims := DiscordStateClaims{
		AllianceID: allianceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(10 * time.Minute)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ValidateDiscordState(tokenString string, secret string) (*DiscordStateClaims, error) {
	claims := &DiscordStateClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid or expired state token")
	}

	return claims, nil
}
