package db

type PlayerProfile struct {
	FID          int64   `db:"player_id" json:"fid"`
	Nickname     string  `db:"nickname" json:"nickname"`
	Avatar       string  `db:"avatar_image" json:"avatar"`
	StoveLv      int     `db:"stove_lv" json:"stoveLv"`
	StoveImg     string  `db:"stove_lv_content" json:"stoveImg"`
	TroopType    string  `db:"troop_type" json:"troopType"`
	TundraPower  int64   `db:"tundra_power" json:"power"`
	NormalPower  int64   `db:"normal_power" json:"normalPower"`
	Avail0200    bool    `db:"avail_0200" json:"avail_0200"`
	Avail0700    bool    `db:"avail_0700" json:"avail_0700"`
	Avail1200    bool    `db:"avail_1200" json:"avail_1200"`
	Avail1400    bool    `db:"avail_1400" json:"avail_1400"`
	Avail1900    bool    `db:"avail_1900" json:"avail_1900"`
	AvailPB      bool    `db:"avail_pb" json:"avail_pb"`
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
          p.troop_type, p.tundra_power, p.normal_power,
          p.avail_0200, p.avail_1200, p.avail_0700, p.avail_1400, p.avail_1900, p.avail_pb, 
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
            p.normal_power,
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
