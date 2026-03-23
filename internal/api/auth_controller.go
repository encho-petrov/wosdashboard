package api

import (
	"context"
	"fmt"
	"gift-redeemer/internal/services"
	"net/http"
	"strconv"
	"time"

	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/cache"
	"gift-redeemer/internal/client"
	"gift-redeemer/internal/config"
	"gift-redeemer/internal/db"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/pquerna/otp/totp"
)

type AuthController struct {
	store      *db.Store
	cfg        *config.Config
	client     *client.PlayerClient
	redisStore *cache.RedisStore
	sseBroker  *services.SSEBroker
}

func NewAuthController(s *db.Store, c *config.Config, p *client.PlayerClient, r *cache.RedisStore, b *services.SSEBroker) *AuthController {
	return &AuthController{
		store:      s,
		cfg:        c,
		client:     p,
		redisStore: r,
		sseBroker:  b,
	}
}

const (
	MaxPlayerLoginAttempts = 3
	PlayerLoginWindow      = 15 * time.Minute
)

func (ac *AuthController) Login(c *gin.Context) {
	ip := c.ClientIP()

	if ac.redisStore.GetLoginAttempts(ip) >= 5 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many failed attempts. Try again in 15 minutes."})
		return
	}

	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := ac.store.GetUserByUsername(input.Username)
	if err != nil {
		ac.redisStore.RecordFailedLogin(ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if !auth.CheckPassword(input.Password, user.PasswordHash) {
		ac.redisStore.RecordFailedLogin(ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	ac.redisStore.ClearLoginAttempts(ip)

	if user.MFAEnabled {
		tempToken := fmt.Sprintf("%d", time.Now().UnixNano())
		ac.redisStore.SetMfaSession(tempToken, user.Username)
		hasWebAuthn := ac.store.HasWebAuthn(user.ID)

		c.JSON(http.StatusOK, gin.H{
			"mfa_required": true,
			"has_webauthn": hasWebAuthn,
			"temp_token":   tempToken,
		})
		return
	}

	token, _ := auth.GenerateToken(user.Username, user.Role)
	refreshToken, _ := auth.GenerateRefreshToken(user.Username, user.Role)

	isSecure := gin.Mode() == gin.ReleaseMode
	c.SetCookie("refresh_token", refreshToken, ac.cfg.Auth.RefreshTokenDuration*60, "/", "", isSecure, true)

	c.JSON(http.StatusOK, gin.H{
		"token":       token,
		"role":        user.Role,
		"mfa_enabled": user.MFAEnabled,
		"allianceId":  user.AllianceID,
		"username":    user.Username,
	})
}

func (ac *AuthController) VerifyMFA(c *gin.Context) {
	var input struct {
		TempToken string `json:"temp_token" binding:"required"`
		Code      string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}

	username := ac.redisStore.GetMfaSession(input.TempToken)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired. Please log in again."})
		return
	}

	user, _ := ac.store.GetUserByUsername(username)
	if !totp.Validate(input.Code, user.MFASecret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authenticator code"})
		return
	}

	ac.redisStore.DeleteMfaSession(input.TempToken)
	token, _ := auth.GenerateToken(user.Username, user.Role)
	refreshToken, _ := auth.GenerateRefreshToken(user.Username, user.Role)

	isSecure := gin.Mode() == gin.ReleaseMode
	c.SetCookie("refresh_token", refreshToken, ac.cfg.Auth.RefreshTokenDuration*60, "/", "", isSecure, true)

	c.JSON(http.StatusOK, gin.H{
		"token":       token,
		"role":        user.Role,
		"mfa_enabled": user.MFAEnabled,
		"allianceId":  user.AllianceID,
		"username":    user.Username,
	})
}

func (ac *AuthController) PlayerLogin(c *gin.Context) {
	var input struct {
		FID int64 `json:"fid" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Game ID (FID) is required"})
		return
	}

	clientIP := c.ClientIP()
	allowed, err := CheckPlayerLoginRateLimit(ac.redisStore.Client, clientIP, input.FID)
	if err != nil {
		fmt.Printf("Rate limit error: %v\n", err)
		c.JSON(500, gin.H{"error": "Internal server error during security check"})
		return
	}

	if !allowed {
		c.JSON(429, gin.H{"error": "Too many login attempts. Please try again in 15 minutes."})
		return
	}

	info, err := ac.client.GetPlayerInfo(input.FID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to connect to Game API"})
		return
	}
	if info.Code != 0 {
		c.JSON(401, gin.H{"error": "Player not found or invalid ID"})
		return
	}

	if info.Data.KID != ac.cfg.Game.TargetState {
		c.JSON(403, gin.H{
			"error": fmt.Sprintf("Access Denied. This tool is for State 391 only. You are in State %d.", info.Data.KID),
		})
		return
	}

	err = ac.store.UpsertPlayer(
		input.FID,
		info.Data.Nickname,
		info.Data.KID,
		info.Data.StoveLv,
		string(info.Data.StoveImg),
		info.Data.Avatar,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "Database error saving player"})
		return
	}

	fidStr := fmt.Sprintf("%d", input.FID)
	token, _ := auth.GenerateToken(fidStr, "player")
	refreshToken, _ := auth.GenerateRefreshToken(fidStr, "player")

	isSecure := gin.Mode() == gin.ReleaseMode
	c.SetCookie("refresh_token", refreshToken, ac.cfg.Auth.RefreshTokenDuration*60, "/", "", isSecure, true)

	c.JSON(200, gin.H{"token": token, "role": "player", "nickname": info.Data.Nickname})
}

func (ac *AuthController) Refresh(c *gin.Context) {
	refreshTokenStr, err := c.Cookie("refresh_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token missing"})
		return
	}

	claims, err := auth.ValidateToken(refreshTokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	user, err := ac.store.GetUserByUsername(claims.Username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User no longer exists"})
		return
	}

	newToken, _ := auth.GenerateToken(user.Username, user.Role)

	c.JSON(http.StatusOK, gin.H{
		"token": newToken,
	})
}

func (ac *AuthController) WebAuthNLoginBegin(c *gin.Context) {
	tempToken := c.Query("temp_token")
	if tempToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing token"})
		return
	}

	username := ac.redisStore.GetMfaSession(tempToken)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired. Please log in again."})
		return
	}

	user, _ := ac.store.GetUserByUsername(username)
	ac.store.LoadWebAuthnCredentials(user)

	options, sessionData, err := auth.WA.BeginLogin(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to begin login"})
		return
	}

	ac.redisStore.SetWebAuthnSession(tempToken, sessionData)
	c.JSON(http.StatusOK, options)
}

func (ac *AuthController) WebAuthNLoginEnd(c *gin.Context) {
	tempToken := c.Query("temp_token")
	username := ac.redisStore.GetMfaSession(tempToken)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired. Please log in again."})
		return
	}

	user, _ := ac.store.GetUserByUsername(username)
	ac.store.LoadWebAuthnCredentials(user)

	sessionData, err := ac.redisStore.GetWebAuthnSession(tempToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session expired"})
		return
	}

	_, err = auth.WA.FinishLogin(user, *sessionData, c.Request)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Biometric verification failed"})
		return
	}

	ac.redisStore.DeleteMfaSession(tempToken)
	ac.redisStore.DeleteWebAuthnSession(tempToken)

	token, _ := auth.GenerateToken(user.Username, user.Role)
	refreshToken, _ := auth.GenerateRefreshToken(user.Username, user.Role)

	isSecure := gin.Mode() == gin.ReleaseMode
	c.SetCookie("refresh_token", refreshToken, ac.cfg.Auth.RefreshTokenDuration*60, "/", "", isSecure, true)

	c.JSON(http.StatusOK, gin.H{
		"token":       token,
		"role":        user.Role,
		"mfa_enabled": user.MFAEnabled,
		"allianceId":  user.AllianceID,
		"username":    user.Username,
	})
}

func (ac *AuthController) WebAuthNLRegisterBegin(c *gin.Context) {
	username := c.GetString("username")
	user, err := ac.store.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	ac.store.LoadWebAuthnCredentials(user)

	options, sessionData, err := auth.WA.BeginRegistration(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to begin registration"})
		return
	}

	err = ac.redisStore.SetWebAuthnSession(username, sessionData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save session"})
		return
	}

	c.JSON(http.StatusOK, options)
}

func (ac *AuthController) WebAuthNLRegisterEnd(c *gin.Context) {
	username := c.GetString("username")
	user, _ := ac.store.GetUserByUsername(username)
	ac.store.LoadWebAuthnCredentials(user)

	sessionData, err := ac.redisStore.GetWebAuthnSession(username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session expired or invalid"})
		return
	}

	credential, err := auth.WA.FinishRegistration(user, *sessionData, c.Request)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Registration verification failed"})
		return
	}

	if err := ac.store.SaveWebAuthnCredential(user.ID, credential); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save credential"})
		return
	}

	ac.redisStore.DeleteWebAuthnSession(username)
	c.JSON(http.StatusOK, gin.H{"message": "Biometric login enabled successfully!"})
}

func (ac *AuthController) WebAuthNDeleteDevice(c *gin.Context) {
	username := c.GetString("username")
	user, _ := ac.store.GetUserByUsername(username)

	var request struct {
		CredentialID string `json:"credential_id"`
	}

	if err := c.BindJSON(&request); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	if err := ac.store.DeleteWebAuthnCredential(user.ID, request.CredentialID); err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete device"})
		return
	}

	c.JSON(200, gin.H{"message": "Device removed successfully"})
}

func (ac *AuthController) GenerateMfa(c *gin.Context) {
	username := c.GetString("username")

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "WoS Admin Panel",
		AccountName: username,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate MFA token"})
		return
	}

	c.JSON(200, gin.H{"secret": key.Secret(), "url": key.URL()})
}

func (ac *AuthController) EnableMfa(c *gin.Context) {
	var input struct {
		Secret string `json:"secret" binding:"required"`
		Code   string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return
	}

	username := c.GetString("username")
	user, _ := ac.store.GetUserByUsername(username)

	valid := totp.Validate(input.Code, input.Secret)
	if !valid {
		c.JSON(400, gin.H{"error": "Invalid authenticator code"})
		return
	}

	if err := ac.store.EnableUserMFA(int64(user.ID), input.Secret); err != nil {
		c.JSON(500, gin.H{"error": "Failed to save MFA settings"})
		return
	}

	c.JSON(200, gin.H{"message": "MFA Enabled Successfully"})
}

func (ac *AuthController) AuthMe(c *gin.Context) {
	username := c.GetString("username")

	user, err := ac.store.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User profile not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"username":    user.Username,
		"role":        user.Role,
		"mfa_enabled": user.MFAEnabled,
		"allianceId":  user.AllianceID,
	})
}

func (ac *AuthController) ChangePassword(c *gin.Context) {
	var input struct {
		OldPassword string `json:"oldPassword" binding:"required"`
		NewPassword string `json:"newPassword" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	username := c.GetString("username")

	user, err := ac.store.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if !auth.CheckPassword(input.OldPassword, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect old password"})
		return
	}

	newHash, _ := auth.HashPassword(input.NewPassword)

	if err := ac.store.UpdatePassword(username, newHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
}

func (ac *AuthController) GetUserProfile(c *gin.Context) {
	username := c.GetString("username")
	user, err := ac.store.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	hasWebAuthn := ac.store.HasWebAuthn(user.ID)
	devices, _ := ac.store.GetUserWebAuthnDevices(user.ID)

	c.JSON(http.StatusOK, gin.H{
		"username":     user.Username,
		"role":         user.Role,
		"mfa_enabled":  user.MFAEnabled,
		"has_webauthn": hasWebAuthn,
		"devices":      devices,
	})
}

func CheckPlayerLoginRateLimit(rClient *redis.Client, ipAddress string, playerID int64) (bool, error) {
	ctx := context.Background()

	ipKey := fmt.Sprintf("ratelimit:player:ip:%s", ipAddress)
	idKey := fmt.Sprintf("ratelimit:player:id:%d", playerID)

	pipe := rClient.Pipeline()
	ipIncr := pipe.Incr(ctx, ipKey)
	idIncr := pipe.Incr(ctx, idKey)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, fmt.Errorf("redis pipeline failed: %w", err)
	}

	if ipIncr.Val() == 1 {
		rClient.Expire(ctx, ipKey, PlayerLoginWindow)
	}
	if idIncr.Val() == 1 {
		rClient.Expire(ctx, idKey, PlayerLoginWindow)
	}

	if ipIncr.Val() > MaxPlayerLoginAttempts || idIncr.Val() > MaxPlayerLoginAttempts {
		return false, nil
	}

	return true, nil
}

func (ac *AuthController) ResetUserSecurity(c *gin.Context) {
	idParam := c.Param("id")
	id, _ := strconv.Atoi(idParam)

	if id == 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "The master admin account cannot be reset this way."})
		return
	}

	var input struct {
		NewPassword string `json:"new_password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "New password is required"})
		return
	}

	hash, _ := auth.HashPassword(input.NewPassword)

	if err := ac.store.ResetUserSecurity(id, hash); err != nil {
		c.JSON(500, gin.H{"error": "Failed to reset user security"})
		return
	}

	logAction(c, ac.store, "RESET_SECURITY", fmt.Sprintf("Reset password and wiped MFA for user ID: %d", id))
	ac.sseBroker.Notifier <- "REFRESH_USERS"
	c.JSON(200, gin.H{"message": "Security reset successfully"})
}
