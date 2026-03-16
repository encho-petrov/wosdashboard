package api

import (
	"context"
	"log"
	"os"
	"testing"

	"gift-redeemer/internal/db"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/testcontainers/testcontainers-go/modules/mysql"
)

var (
	testStore *db.Store
	rawDB     *sqlx.DB
)

func TestMain(m *testing.M) {
	// Silence Gin's debug logging during tests
	gin.SetMode(gin.TestMode)

	ctx := context.Background()

	// 1. Spin up the MySQL container
	mysqlContainer, err := mysql.Run(ctx,
		"mysql:8.0",
		mysql.WithDatabase("test_db"),
		mysql.WithUsername("test_user"),
		mysql.WithPassword("test_password"),
	)
	if err != nil {
		log.Fatalf("Failed to start MySQL container: %s", err)
	}

	defer func() {
		if err := mysqlContainer.Terminate(ctx); err != nil {
			log.Fatalf("Failed to terminate container: %s", err)
		}
	}()

	// 2. Open the RAW database connection (Requires multiStatements=true for the schema)
	connStr, err := mysqlContainer.ConnectionString(ctx, "parseTime=true&multiStatements=true")
	if err != nil {
		log.Fatalf("Failed to get connection string: %s", err)
	}

	rawDB, err = sqlx.Connect("mysql", connStr)
	if err != nil {
		log.Fatalf("Failed to connect raw test database: %s", err)
	}
	defer rawDB.Close()

	// 3. Apply the schema using the raw connection
	schemaBytes, err := os.ReadFile("../db/test_schema.sql")
	if err != nil {
		log.Fatalf("Failed to read test_schema.sql: %s", err)
	}
	if _, err := rawDB.Exec(string(schemaBytes)); err != nil {
		log.Fatalf("Failed to apply test_schema.sql: %s", err)
	}

	// 4. Initialize your REAL db.Store using your existing constructor!
	endpoint, err := mysqlContainer.Endpoint(ctx, "")
	if err != nil {
		log.Fatalf("Failed to get container endpoint: %s", err)
	}

	// Pass the container's generated endpoint (host:port) right into your function
	testStore, err = db.NewStore("test_user", "test_password", endpoint, "test_db")
	if err != nil {
		log.Fatalf("Failed to initialize db.Store: %s", err)
	}
	defer testStore.Close()

	// Run all tests in the API package
	code := m.Run()
	os.Exit(code)
}

// resetDB wipes the tables between test suites using the rawDB connection
func resetDB(t *testing.T) {
	tables := []string{"alliances", "users", "audit_logs"}
	for _, table := range tables {
		_, err := rawDB.Exec("TRUNCATE TABLE " + table)
		if err != nil {
			t.Fatalf("Failed to reset table %s: %v", table, err)
		}
	}

	// Seed the master admin so we don't break the "ID 1" protection checks
	rawDB.Exec("INSERT INTO users (id, username, role) VALUES (1, 'MasterAdmin', 'admin')")
}

// MockAdminMiddleware bypasses real authentication and acts as a logged-in admin
func MockAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userId", int64(1))
		c.Set("role", "admin")
		c.Next()
	}
}
