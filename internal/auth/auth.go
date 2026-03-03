package auth

import (
	"errors"
	"fmt"
	"gift-redeemer/internal/config"
	"log"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret []byte
var accessTokenDuration = 10
var refreshTokenDuration = 30

func Init(cfg *config.Config) {
	if cfg.ApiSecrets.JwtSecret == "" {
		log.Fatal("FATAL: JwtSecret is missing in appsettings.json")
	}
	jwtSecret = []byte(cfg.ApiSecrets.JwtSecret)
	accessTokenDuration = cfg.Auth.AccessTokenDuration
	refreshTokenDuration = cfg.Auth.RefreshTokenDuration
}

type Claims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateToken(username, role string) (string, error) {
	expirationTime := time.Now().Add(time.Duration(accessTokenDuration) * time.Minute)
	claims := &Claims{
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

var WA *webauthn.WebAuthn

func InitWebAuthn(rpDisplayName, rpID, rpOrigin string) error {
	wconfig := &webauthn.Config{
		RPDisplayName: rpDisplayName,
		RPID:          rpID,
		RPOrigins:     []string{rpOrigin},

		AuthenticatorSelection: protocol.AuthenticatorSelection{
			AuthenticatorAttachment: protocol.Platform,
			UserVerification:        protocol.VerificationRequired,
			ResidentKey:             protocol.ResidentKeyRequirementPreferred,
		},
	}

	var err error
	WA, err = webauthn.New(wconfig)
	if err != nil {
		return fmt.Errorf("failed to create WebAuthn instance: %v", err)
	}
	return nil
}

func GenerateRefreshToken(username, role string) (string, error) {
	expirationTime := time.Now().Add(time.Duration(refreshTokenDuration) * time.Minute)
	claims := &Claims{
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}
