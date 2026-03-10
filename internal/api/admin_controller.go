package api

import (
	"fmt"
	"gift-redeemer/internal/auth"
	"gift-redeemer/internal/db"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type AdminController struct {
	store *db.Store
}

func NewAdminController(s *db.Store) *AdminController {
	return &AdminController{
		store: s,
	}
}

func (ac *AdminController) ListAlliances(c *gin.Context) {
	list, err := ac.store.GetAlliances()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch alliances"})
		return
	}
	c.JSON(200, list)
}

func (ac *AdminController) CreateAlliance(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
		Type string `json:"type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Name and Type are required"})
		return
	}
	if err := ac.store.CreateAlliance(input.Name, input.Type); err != nil {
		c.JSON(500, gin.H{"error": "Database error"})
		return
	}
	c.JSON(200, gin.H{"message": "Alliance created successfully"})
}

func (ac *AdminController) UpdateAlliance(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var input struct {
		Name string `json:"name" binding:"required"`
		Type string `json:"type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}
	if err := ac.store.UpdateAlliance(id, input.Name, input.Type); err != nil {
		c.JSON(500, gin.H{"error": "Update failed"})
		return
	}
	c.JSON(200, gin.H{"message": "Alliance updated"})
}

func (ac *AdminController) DeleteAlliance(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := ac.store.DeleteAlliance(id); err != nil {
		c.JSON(400, gin.H{"error": "Cannot delete: Ensure no players are assigned to this alliance first."})
		return
	}
	c.JSON(200, gin.H{"message": "Alliance deleted"})
}

func (ac *AdminController) GetAuditLogs(c *gin.Context) {
	if c.GetString("role") != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
		return
	}

	logs, err := ac.store.GetAuditLogs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch logs"})
		return
	}

	c.JSON(http.StatusOK, logs)
}

func (ac *AdminController) CreateUser(c *gin.Context) {
	var input struct {
		Username   string `json:"username" binding:"required"`
		Password   string `json:"password" binding:"required"`
		Role       string `json:"role" binding:"required"`
		AllianceID int    `json:"allianceId"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	existing, err := ac.store.GetUserByUsername(input.Username)
	if err == nil && existing.ID != 0 {
		c.JSON(409, gin.H{"error": "Username already taken"})
		return
	}

	hash, _ := auth.HashPassword(input.Password)
	if err := ac.store.CreateUser(input.Username, hash, input.Role, input.AllianceID); err != nil {
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}
	logAction(c, ac.store, "ADD_USER", fmt.Sprintf("Created user: %s", input.Username))
	c.JSON(201, gin.H{"message": "User created successfully"})
}

func (ac *AdminController) GetAllUsers(c *gin.Context) {
	users, err := ac.store.GetAllUsers()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch users"})
		return
	}
	c.JSON(200, users)
}

func (ac *AdminController) UpdateUser(c *gin.Context) {
	idParam := c.Param("id")
	id, _ := strconv.Atoi(idParam)

	if id == 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "The master admin account cannot be modified."})
		return
	}

	var input struct {
		Role       string `json:"role" binding:"required"`
		AllianceID *int   `json:"allianceId"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if err := ac.store.UpdateUserAccess(id, input.Role, input.AllianceID); err != nil {
		c.JSON(500, gin.H{"error": "Failed to modify user"})
		return
	}

	logAction(c, ac.store, "EDIT_USER", fmt.Sprintf("Modified user ID: %d", id))
	c.JSON(200, gin.H{"message": "User modified successfully"})
}

func (ac *AdminController) DeleteUser(c *gin.Context) {
	idParam := c.Param("id")
	id, _ := strconv.Atoi(idParam)

	if id == 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "The master admin account cannot be deleted."})
		return
	}

	if err := ac.store.DeleteUser(id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete user"})
		return
	}
	logAction(c, ac.store, "DELETE_USER", fmt.Sprintf("Deleted user ID: %d", id))
	c.JSON(200, gin.H{"message": "User deleted"})
}
