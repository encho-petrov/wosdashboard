package db

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

type JsonNullString struct {
	sql.NullString
}

func (v JsonNullString) MarshalJSON() ([]byte, error) {
	if v.Valid {
		return json.Marshal(v.String)
	}
	return json.Marshal(nil)
}

type JsonNullTime struct {
	sql.NullTime
}

func (v JsonNullTime) MarshalJSON() ([]byte, error) {
	if v.Valid {
		return json.Marshal(v.Time)
	}
	return json.Marshal(nil)
}

type PlayerRow struct {
	FID       int64  `db:"player_id" json:"fid"`
	Nickname  string `db:"nickname" json:"nickname"`
	Avatar    string `db:"avatar_image" json:"avatar"`
	StoveLv   int    `db:"stove_lv" json:"stoveLv"`
	Power     int64  `db:"tundra_power" json:"power"`
	TroopType string `db:"troop_type" json:"troopType"`

	AllianceID   *int    `db:"alliance_id" json:"allianceId"`
	AllianceName *string `db:"alliance_name" json:"allianceName"`
	TeamID       *int    `db:"team_id" json:"teamId"`
	TeamName     *string `db:"team_name" json:"teamName"`

	StoveImg           string  `db:"stove_lv_content" json:"stoveImg"`
	BattleAvailability *string `db:"battle_availability" json:"battleAvailability"`
	TundraAvailability *string `db:"tundra_availability" json:"tundraAvailability"`

	FightingAllianceID   *int    `db:"fighting_alliance_id" json:"fightingAllianceId"`
	FightingAllianceName *string `db:"fighting_alliance_name" json:"fightingAllianceName"`
}

type Store struct {
	db *sqlx.DB
}

func NewStore(user, pass, host, dbName string) (*Store, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true", user, pass, host, dbName)
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}
