package db

import (
	"database/sql"
	"errors"
	"time"
)

type MinistryEvent struct {
	ID              int          `db:"id" json:"id"`
	Title           string       `db:"title" json:"title"`
	Status          string       `db:"status" json:"status"`
	AnnounceEnabled bool         `db:"announce_enabled" json:"announceEnabled"`
	CreatedAt       time.Time    `db:"created_at" json:"createdAt"`
	ClosedAt        sql.NullTime `db:"closed_at" json:"closedAt"`
}

type MinistryDay struct {
	ID         int    `db:"id" json:"id"`
	EventID    int    `db:"event_id" json:"eventId"`
	BuffName   string `db:"buff_name" json:"buffName"`
	ActiveDate string `db:"active_date" json:"activeDate"`
}

type MinistrySlot struct {
	ID           int     `db:"id" json:"id"`
	DayID        int     `db:"day_id" json:"dayId"`
	SlotIndex    int     `db:"slot_index" json:"slotIndex"`
	PlayerFID    *int64  `db:"player_fid" json:"playerFid"`
	Nickname     *string `db:"nickname" json:"nickname"`
	AllianceName *string `db:"alliance_name" json:"allianceName"`
}

type PlayerMinistrySlot struct {
	ID           int     `db:"id" json:"id"`
	DayID        int     `db:"day_id" json:"dayId"`
	SlotIndex    int     `db:"slot_index" json:"slotIndex"`
	PlayerFID    *int64  `db:"player_fid" json:"playerFid"`
	Nickname     *string `db:"nickname" json:"nickname"`
	AllianceName *string `db:"alliance_name" json:"allianceName"`
	BuffName     string  `db:"buff_name" json:"buffName"`
	ActiveDate   string  `db:"active_date" json:"activeDate"`
}

func (s *Store) CreateMinistryEvent(title string, announceEnabled bool, days []MinistryDay) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO ministry_events (title, announce_enabled, status) VALUES (?, ?, 'Planning')", title, announceEnabled)
	if err != nil {
		return err
	}
	eventID, _ := res.LastInsertId()

	for _, day := range days {
		dayRes, err := tx.Exec("INSERT INTO ministry_days (event_id, buff_name, active_date) VALUES (?, ?, ?)",
			eventID, day.BuffName, day.ActiveDate)
		if err != nil {
			return err
		}
		dayID, _ := dayRes.LastInsertId()

		for i := 0; i < 48; i++ {
			_, err := tx.Exec("INSERT INTO ministry_slots (day_id, slot_index) VALUES (?, ?)", dayID, i)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (s *Store) GetActiveMinistryEvent() (*MinistryEvent, error) {
	var event MinistryEvent
	err := s.db.Get(&event, "SELECT * FROM ministry_events WHERE status IN ('Planning', 'Active') ORDER BY created_at DESC LIMIT 1")
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &event, err
}

func (s *Store) GetMinistryDays(eventID int) ([]MinistryDay, error) {
	var days []MinistryDay
	err := s.db.Select(&days, "SELECT * FROM ministry_days WHERE event_id = ? ORDER BY active_date ASC", eventID)
	return days, err
}

func (s *Store) GetMinistrySlots(dayID int) ([]MinistrySlot, error) {
	var slots []MinistrySlot
	query := `
		SELECT s.id, s.day_id, s.slot_index, s.player_fid,
		       p.nickname, a.name AS alliance_name
		FROM ministry_slots s
		LEFT JOIN players p ON s.player_fid = p.player_id
		LEFT JOIN alliances a ON p.alliance_id = a.id
		WHERE s.day_id = ?
		ORDER BY s.slot_index ASC`
	err := s.db.Select(&slots, query, dayID)
	return slots, err
}

func (s *Store) UpdateMinistrySlot(slotID int, playerFID *int64) error {
	_, err := s.db.Exec("UPDATE ministry_slots SET player_fid = ? WHERE id = ?", playerFID, slotID)
	return err
}

func (s *Store) UpdateMinistryStatus(eventID int, status string) error {
	var query string
	if status == "Closed" {
		query = "UPDATE ministry_events SET status = ?, closed_at = NOW() WHERE id = ?"
	} else {
		query = "UPDATE ministry_events SET status = ? WHERE id = ?"
	}
	_, err := s.db.Exec(query, status, eventID)
	return err
}

func (s *Store) UpdateMinistryAnnounce(eventID int, enabled bool) error {
	_, err := s.db.Exec("UPDATE ministry_events SET announce_enabled = ? WHERE id = ?", enabled, eventID)
	return err
}

func (s *Store) GetMinistryDayByDate(eventID int, dateStr string) (*MinistryDay, error) {
	var day MinistryDay
	err := s.db.Get(&day, "SELECT * FROM ministry_days WHERE event_id = ? AND active_date = ?", eventID, dateStr)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &day, err
}

func (s *Store) GetMinistrySlotByIndex(dayID int, slotIndex int) (*MinistrySlot, error) {
	var slot MinistrySlot
	query := `
		SELECT s.id, s.day_id, s.slot_index, s.player_fid, p.nickname, a.name AS alliance_name
		FROM ministry_slots s
		JOIN players p ON s.player_fid = p.player_id
		LEFT JOIN alliances a ON p.alliance_id = a.id
		WHERE s.day_id = ? AND s.slot_index = ?`
	err := s.db.Get(&slot, query, dayID, slotIndex)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &slot, err
}

func (s *Store) GetClosedMinistryEvents() ([]MinistryEvent, error) {
	var events []MinistryEvent
	err := s.db.Select(&events, "SELECT * FROM ministry_events WHERE status = 'Closed' ORDER BY closed_at DESC")
	return events, err
}

func (s *Store) GetPlayerMinistrySlots(playerFID int64) ([]PlayerMinistrySlot, error) {
	var slots []PlayerMinistrySlot

	query := `
       SELECT s.id, s.day_id, s.slot_index, s.player_fid,
              p.nickname, a.name AS alliance_name,
              md.buff_name, md.active_date
       FROM ministry_slots s
       LEFT JOIN players p ON s.player_fid = p.player_id
       LEFT JOIN alliances a ON p.alliance_id = a.id
       JOIN ministry_days md ON s.day_id = md.id
       JOIN ministry_events me ON md.event_id = me.id
       WHERE s.player_fid = ? AND me.status IN ('Planning', 'Active')
       ORDER BY md.active_date ASC, s.slot_index ASC`

	err := s.db.Select(&slots, query, playerFID)
	return slots, err
}
