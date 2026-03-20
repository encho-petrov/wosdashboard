package db

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/testcontainers/testcontainers-go/modules/mysql"
)

var testStore *Store

func TestMain(m *testing.M) {
	ctx := context.Background()

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

	connStr, err := mysqlContainer.ConnectionString(ctx, "parseTime=true&multiStatements=true")
	if err != nil {
		log.Fatalf("Failed to get connection string: %s", err)
	}

	dbConn, err := sqlx.Connect("mysql", connStr)
	if err != nil {
		log.Fatalf("Failed to connect to test database: %s", err)
	}
	defer dbConn.Close()

	// Read the schema from the external file
	schemaBytes, err := os.ReadFile("test_schema.sql")
	if err != nil {
		log.Fatalf("Failed to read test_schema.sql: %s", err)
	}

	// Execute the entire schema
	if _, err := dbConn.Exec(string(schemaBytes)); err != nil {
		log.Fatalf("Failed to apply schema.sql: %s", err)
	}

	testStore = &Store{db: dbConn}

	code := m.Run()

	os.Exit(code)
}

func resetDB(t *testing.T) {
	tables := []string{
		"alliances", "teams", "players", "war_room_attendance", "event_snapshots",
		"history_teams", "history_players", "users", "alliance_transfers",
		"discord_guilds", "discord_routes", "discord_schedules", "discord_configs",
		"discord_custom_crons", "pet_skill_schedule",
		"buildings", "building_rewards", "rotation_schedule",
		"alliance_event_legions", "alliance_event_roster", "alliance_event_history", "alliance_event_history_players",
		"player_gift_codes", "jobs", "ministry_events", "ministry_days", "ministry_slots",
		"heroes", "battle_strategy", "battle_strategy_heroes",
		"transfer_seasons", "transfer_records", "audit_logs", "webauthn_credentials",
	}
	for _, table := range tables {
		_, err := testStore.db.Exec("TRUNCATE TABLE " + table)
		if err != nil {
			t.Fatalf("Failed to reset table %s: %v", table, err)
		}
	}

	testStore.db.Exec("TRUNCATE TABLE war_room_state")
	testStore.db.Exec("INSERT INTO war_room_state (id, active_event_type) VALUES (1, NULL)")
}
