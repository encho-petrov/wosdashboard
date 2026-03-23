package api

import (
	"gift-redeemer/internal/db"
	"gift-redeemer/internal/services"
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type AllianceController struct {
	store     *db.Store
	sseBroker *services.SSEBroker
}

func NewAllianceController(store *db.Store, sseBroker *services.SSEBroker) *AllianceController {
	return &AllianceController{store: store, sseBroker: sseBroker}
}

type TransferRequestPayload struct {
	TargetUserID int64 `json:"targetUserId"`
	ToAllianceID *int  `json:"toAllianceId"`
}

type ResolveTransferPayload struct {
	Status string `json:"status"`
}

func getInt64FromContext(c *gin.Context, key string) int64 {
	val, exists := c.Get(key)
	if !exists {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return int64(v)
	case int:
		return int64(v)
	case int64:
		return v
	case *int:
		if v == nil {
			return 0
		}
		return int64(*v)
	case *int64:
		if v == nil {
			return 0
		}
		return *v
	case string:
		parsed, _ := strconv.ParseInt(v, 10, 64)
		return parsed
	default:
		return 0
	}
}

func getIntFromContext(c *gin.Context, key string) int {
	val64 := getInt64FromContext(c, key)
	if val64 > int64(math.MaxInt) || val64 < int64(math.MinInt) {
		return 0
	}
	return int(val64)
}

func (ac *AllianceController) HandleTransferRequest(c *gin.Context) {
	requesterID := getInt64FromContext(c, "userId")

	var payload TransferRequestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	currentAlliance, err := ac.store.GetUserAlliance(payload.TargetUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target user not found"})
		return
	}

	if payload.ToAllianceID == nil {
		if err := ac.store.UpdateUserAlliance(payload.TargetUserID, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unassign user"})
			return
		}

		_ = ac.store.LogAutoApprovedTransfer(payload.TargetUserID, requesterID, currentAlliance, nil)

		c.JSON(http.StatusOK, gin.H{"message": "User unassigned successfully."})
		return
	}

	err = ac.store.CreateTransferRequest(payload.TargetUserID, requesterID, currentAlliance, payload.ToAllianceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transfer request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Transfer request submitted for approval."})
}

func (ac *AllianceController) GetNotifications(c *gin.Context) {
	userID := getInt64FromContext(c, "userId")
	role := c.GetString("role")
	allianceID := getIntFromContext(c, "allianceId")

	if role != "admin" {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	var userAlliancePtr *int
	if allianceID != 0 {
		userAlliancePtr = &allianceID
	}

	transfers, err := ac.store.GetPendingTransfers(userID, userAlliancePtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load notifications"})
		return
	}

	c.JSON(http.StatusOK, transfers)
}

func (ac *AllianceController) HandleResolve(c *gin.Context) {
	resolverID := getInt64FromContext(c, "userId")
	role := c.GetString("role")

	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only admins can resolve transfers"})
		return
	}

	transferID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid transfer ID"})
		return
	}

	var payload ResolveTransferPayload
	if err := c.ShouldBindJSON(&payload); err != nil || (payload.Status != "Approved" && payload.Status != "Declined") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status."})
		return
	}

	err = ac.store.ResolveTransfer(transferID, payload.Status, resolverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve transfer request"})
		return
	}

	ac.sseBroker.Notifier <- "REFRESH_ALLIANCES"
	c.JSON(http.StatusOK, gin.H{"message": "Transfer " + payload.Status})
}
