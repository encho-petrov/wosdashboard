package db

type AllianceOption struct {
	ID   int    `db:"id" json:"id"`
	Name string `db:"name" json:"name"`
	Type string `db:"type" json:"type"`
}

func (s *Store) AddPlayers(fids []int64) (added int, skipped int, err error) {
	if len(fids) == 0 {
		return 0, 0, nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare("INSERT IGNORE INTO players (player_id) VALUES (?)")
	if err != nil {
		return 0, 0, err
	}
	defer stmt.Close()
	addedCount := 0
	for _, fid := range fids {
		res, err := stmt.Exec(fid)
		if err != nil {
			return addedCount, 0, err
		}
		rows, _ := res.RowsAffected()
		addedCount += int(rows)
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	skipped = len(fids) - addedCount
	return addedCount, skipped, nil
}

func (s *Store) GetPlayers(allianceFilter *int) ([]PlayerRow, error) {
	query := `
		SELECT 
            p.player_id, 
            COALESCE(p.nickname, 'Unknown') AS nickname, 
            COALESCE(p.avatar_image, '') AS avatar_image, 
            COALESCE(p.stove_lv, 0) as stove_lv, 
            COALESCE(p.stove_lv_content, '') as stove_lv_content,
            p.tundra_power AS tundra_power,
            p.normal_power AS normal_power,
            COALESCE(p.troop_type, 'None') AS troop_type,
            COALESCE(p.battle_availability, 'Unavailable') AS battle_availability,
			p.avail_0200, p.avail_1200, p.avail_0700, p.avail_1400, p.avail_1900, p.avail_PB,
            p.alliance_id, 
            ga.name AS alliance_name,
            p.fighting_alliance_id,
            fa.name AS fighting_alliance_name,
            p.team_id, 
            t.name AS team_name
        FROM players p
        LEFT JOIN alliances ga ON p.alliance_id = ga.id
        LEFT JOIN alliances fa ON p.fighting_alliance_id = fa.id
        LEFT JOIN teams t ON p.team_id = t.id
		WHERE status = 'Active'
    `

	var args []interface{}

	if allianceFilter != nil {
		query += " AND p.alliance_id = ?"
		args = append(args, *allianceFilter)
	}

	query += " ORDER BY p.tundra_power DESC, p.stove_lv DESC"

	var players []PlayerRow
	err := s.db.Select(&players, query, args...)
	return players, err
}

func (s *Store) UpdatePlayerDetails(fid int64, tundraPower int64, normalPower int64, troopType string, battleAvail string, avail0200 bool, avail0700 bool, avail1200 bool, avail1400 bool, avail1900 bool, availPB bool, allianceID *int, fightingAllianceID *int, teamID *int) error {
	query := `
        UPDATE players 
        SET tundra_power = ?, normal_power = ?, troop_type = ?, 
            battle_availability = ?, 
            avail_0200 = ?, avail_0700 = ?, avail_1200 = ?, avail_1400 = ?, avail_1900 = ?, avail_PB = ?,
            alliance_id = ?, fighting_alliance_id = ?, team_id = ? 
        WHERE player_id = ?
    `
	_, err := s.db.Exec(query, tundraPower, normalPower, troopType, battleAvail, avail0200, avail0700, avail1200, avail1400, avail1900, availPB, allianceID, fightingAllianceID, teamID, fid)
	return err
}

func (s *Store) UpsertPlayer(fid int64, nick string, kid, stoveLv int, stoveImg, avatar string) error {
	query := `
		INSERT INTO players (player_id, nickname, kid, stove_lv, stove_lv_content, avatar_image)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			nickname = VALUES(nickname),
			kid = VALUES(kid),
			stove_lv = VALUES(stove_lv),
			stove_lv_content = VALUES(stove_lv_content),
			avatar_image = VALUES(avatar_image),
			last_api_refresh = NOW()
	`
	_, err := s.db.Exec(query, fid, nick, kid, stoveLv, stoveImg, avatar)
	return err
}

func (s *Store) GetAlliances() ([]AllianceOption, error) {
	var list []AllianceOption
	err := s.db.Select(&list, "SELECT id, name, type FROM alliances ORDER BY name, type ASC")
	return list, err
}

func (s *Store) DeletePlayer(fid int64) error {
	_, err := s.db.Exec("DELETE FROM players WHERE player_id = ?", fid)
	return err
}

func (s *Store) GetAllPlayerIDs() ([]int64, error) {
	var ids []int64
	query := "SELECT player_id FROM players"
	err := s.db.Select(&ids, query)
	return ids, err
}
