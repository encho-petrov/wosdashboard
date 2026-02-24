package db

type PlayerProfile struct {
	FID         int64  `db:"player_id" json:"fid"`
	Nickname    string `db:"nickname" json:"nickname"`
	Avatar      string `db:"avatar_image" json:"avatar"`
	StoveLv     int    `db:"stove_lv" json:"stoveLv"`
	StoveImg    string `db:"stove_lv_content" json:"stoveImg"`
	TroopType   string `db:"troop_type" json:"troopType"`
	TundraPower int64  `db:"tundra_power" json:"tundraPower"`

	AllianceName *string `db:"alliance_name" json:"allianceName"`
	TeamName     *string `db:"team_name" json:"teamName"`
	CaptainName  *string `db:"captain_name" json:"captainName"`
}

type DashboardData struct {
	Player    PlayerRow   `json:"player"`
	Teammates []PlayerRow `json:"teammates"`
}

func (s *Store) GetPlayerProfile(fid int64) (*PlayerProfile, error) {
	query := `
		SELECT 
			p.player_id, p.nickname, p.avatar_image, p.stove_lv, p.stove_lv_content, 
			p.troop_type, p.tundra_power,
			a.name AS alliance_name,
			t.name AS team_name,
			c.nickname AS captain_name
		FROM players p
		LEFT JOIN alliances a ON p.alliance_id = a.id
		LEFT JOIN teams t ON p.team_id = t.id
		LEFT JOIN players c ON t.captain_fid = c.player_id 
		WHERE p.player_id = ?
	`

	var profile PlayerProfile
	err := s.db.Get(&profile, query, fid)
	return &profile, err
}

func (s *Store) GetPlayerDashboardData(fid int64) (*DashboardData, error) {
	query := `
        SELECT 
            p.player_id, 
            COALESCE(p.nickname, 'Unknown') AS nickname, 
            COALESCE(p.avatar_image, '') AS avatar_image, 
            p.stove_lv, 
            p.stove_lv_content,
            p.tundra_power, 
            COALESCE(p.troop_type, 'None') AS troop_type,
            
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
        WHERE p.player_id = ?
    `
	var player PlayerRow
	if err := s.db.Get(&player, query, fid); err != nil {
		return nil, err
	}

	var teammates []PlayerRow
	if player.TeamID != nil {
		tQuery := `
            SELECT player_id, nickname, avatar_image, tundra_power, stove_lv_content
            FROM players 
            WHERE team_id = ? AND player_id != ?
            ORDER BY tundra_power DESC
        `
		_ = s.db.Select(&teammates, tQuery, player.TeamID, fid)
	}

	return &DashboardData{Player: player, Teammates: teammates}, nil
}
