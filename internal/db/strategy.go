package db

import (
	"gift-redeemer/internal/models"
	"strconv"
)

type CaptainBadge struct {
	Fid            int64   `json:"fid" db:"captain_fid"`
	Nickname       string  `json:"nickname" db:"nickname"`
	AvatarImage    *string `json:"avatarImage" db:"avatar_image"`
	StoveLvContent *string `json:"stoveLvContent" db:"stove_lv_content"`
	AllianceName   *string `json:"allianceName" db:"alliance_name"`
}

type PetScheduleRequest struct {
	FightDate string             `json:"fightDate"`
	Schedule  map[string][]int64 `json:"schedule"`
}

func (s *Store) GetHeroes() ([]models.Hero, error) {
	var heroes []models.Hero
	query := "SELECT id, name, troop_type, local_image_path FROM heroes ORDER BY name ASC"

	err := s.db.Select(&heroes, query)
	return heroes, err
}

func (s *Store) SaveBattleStrategy(req models.BattleMetaRequest) (int64, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	_, err = tx.Exec("UPDATE battle_strategy SET is_active = FALSE WHERE type = ?", req.Type)
	if err != nil {
		return 0, err
	}

	res, err := tx.Exec(`
        INSERT INTO battle_strategy (type, infantry_ratio, lancer_ratio, marksman_ratio, is_active) 
        VALUES (?, ?, ?, ?, TRUE)`,
		req.Type, req.InfantryRatio, req.LancerRatio, req.MarksmanRatio)

	if err != nil {
		return 0, err
	}

	strategyID, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}

	for i, heroID := range req.Leads {
		_, err = tx.Exec("INSERT INTO battle_strategy_heroes (strategy_id, hero_id, role, slot_position) VALUES (?, ?, 'Lead', ?)", strategyID, heroID, i+1)
		if err != nil {
			return 0, err
		}
	}

	for i, heroID := range req.Joiners {
		_, err = tx.Exec("INSERT INTO battle_strategy_heroes (strategy_id, hero_id, role, slot_position) VALUES (?, ?, 'Joiner', ?)", strategyID, heroID, i+1)
		if err != nil {
			return 0, err
		}
	}

	if err = tx.Commit(); err != nil {
		return 0, err
	}

	return strategyID, nil
}

func (s *Store) GetActiveStrategy() (*models.ActiveStrategyResponse, error) {
	response := &models.ActiveStrategyResponse{}

	var strategies []struct {
		ID            int    `db:"id"`
		Type          string `db:"type"`
		InfantryRatio int    `db:"infantry_ratio"`
		LancerRatio   int    `db:"lancer_ratio"`
		MarksmanRatio int    `db:"marksman_ratio"`
	}

	query := "SELECT id, type, infantry_ratio, lancer_ratio, marksman_ratio FROM battle_strategy WHERE is_active = TRUE"
	if err := s.db.Select(&strategies, query); err != nil {
		return nil, err
	}

	for _, strat := range strategies {
		meta := &models.BattleMetaRequest{
			Type:          strat.Type,
			InfantryRatio: strat.InfantryRatio,
			LancerRatio:   strat.LancerRatio,
			MarksmanRatio: strat.MarksmanRatio,
			Leads:         make([]int, 3),
			Joiners:       make([]int, 4),
		}

		var heroes []struct {
			HeroID       int    `db:"hero_id"`
			Role         string `db:"role"`
			SlotPosition int    `db:"slot_position"`
		}

		heroQuery := "SELECT hero_id, role, slot_position FROM battle_strategy_heroes WHERE strategy_id = ?"
		if err := s.db.Select(&heroes, heroQuery, strat.ID); err != nil {
			return nil, err
		}

		for _, h := range heroes {
			if h.Role == "Lead" && h.SlotPosition >= 1 && h.SlotPosition <= 3 {
				meta.Leads[h.SlotPosition-1] = h.HeroID
			} else if h.Role == "Joiner" && h.SlotPosition >= 1 && h.SlotPosition <= 4 {
				meta.Joiners[h.SlotPosition-1] = h.HeroID
			}
		}

		if strat.Type == "Attack" {
			response.Attack = meta
		} else if strat.Type == "Defense" {
			response.Defense = meta
		}
	}

	return response, nil
}

func (s *Store) GetActiveCaptains() ([]CaptainBadge, error) {
	var captains []CaptainBadge

	query := `
        SELECT 
            t.captain_fid, 
            p.nickname, 
            p.avatar_image, 
            p.stove_lv_content, 
            a.name AS alliance_name
        FROM teams t
        JOIN players p ON t.captain_fid = p.player_id
        LEFT JOIN alliances a ON p.alliance_id = a.id
        WHERE t.captain_fid IS NOT NULL AND t.captain_fid != 0
        GROUP BY t.captain_fid
        ORDER BY p.nickname ASC
    `

	err := s.db.Select(&captains, query)

	if captains == nil {
		captains = []CaptainBadge{}
	}

	return captains, err
}

func (s *Store) SavePetSchedule(req PetScheduleRequest) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec("DELETE FROM pet_skill_schedule WHERE fight_date = ?", req.FightDate)
	if err != nil {
		return err
	}

	for slotIdStr, captains := range req.Schedule {
		slotId, _ := strconv.Atoi(slotIdStr)
		for _, fid := range captains {
			_, err = tx.Exec("INSERT INTO pet_skill_schedule (fight_date, slot_id, captain_fid) VALUES (?, ?, ?)", req.FightDate, slotId, fid)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (s *Store) GetCaptainsForPetSlot(date string, slotId int) ([]CaptainBadge, error) {
	var captains []CaptainBadge
	query := `
        SELECT pss.captain_fid, p.nickname, p.avatar_image, p.stove_lv_content, a.name AS alliance_name
        FROM pet_skill_schedule pss
        JOIN players p ON pss.captain_fid = p.player_id
        LEFT JOIN alliances a ON p.alliance_id = a.id
        WHERE pss.fight_date = ? AND pss.slot_id = ?
    `
	err := s.db.Select(&captains, query, date, slotId)
	if captains == nil {
		captains = []CaptainBadge{}
	}
	return captains, err
}

func (s *Store) GetPetScheduleByDate(date string) (map[string][]int64, error) {
	type row struct {
		SlotID     int   `db:"slot_id"`
		CaptainFID int64 `db:"captain_fid"`
	}
	var rows []row
	query := "SELECT slot_id, captain_fid FROM pet_skill_schedule WHERE fight_date = ?"

	err := s.db.Select(&rows, query, date)
	if err != nil {
		return nil, err
	}

	result := map[string][]int64{
		"1": {}, "2": {}, "3": {},
	}

	for _, r := range rows {
		slotKey := strconv.Itoa(r.SlotID)
		result[slotKey] = append(result[slotKey], r.CaptainFID)
	}

	return result, nil
}
