package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

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
	FID         int64  `db:"player_id" json:"fid"`
	Nickname    string `db:"nickname" json:"nickname"`
	Avatar      string `db:"avatar_image" json:"avatar"`
	StoveLv     int    `db:"stove_lv" json:"stoveLv"`
	Power       int64  `db:"tundra_power" json:"power"`
	NormalPower int64  `db:"normal_power" json:"normalPower"`
	TroopType   string `db:"troop_type" json:"troopType"`

	AllianceID   *int    `db:"alliance_id" json:"allianceId"`
	AllianceName *string `db:"alliance_name" json:"allianceName"`
	TeamID       *int    `db:"team_id" json:"teamId"`
	TeamName     *string `db:"team_name" json:"teamName"`

	StoveImg             string  `db:"stove_lv_content" json:"stoveImg"`
	BattleAvailability   *string `db:"battle_availability" json:"battleAvailability"`
	Avail0200            bool    `db:"avail_0200" json:"avail_0200"`
	Avail1200            bool    `db:"avail_1200" json:"avail_1200"`
	Avail0700            bool    `db:"avail_0700" json:"avail_0700"`
	Avail1400            bool    `db:"avail_1400" json:"avail_1400"`
	Avail1900            bool    `db:"avail_1900" json:"avail_1900"`
	AvailPB              bool    `db:"avail_PB" json:"avail_PB"`
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

func (s *Store) Close() error {
	log.Println("Closing database connection pool...")
	return s.db.Close()
}
