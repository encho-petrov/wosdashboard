package db

func (s *Store) CreateAlliance(name, aType string) error {
	_, err := s.db.Exec("INSERT INTO alliances (name, type) VALUES (?, ?)", name, aType)
	return err
}

func (s *Store) UpdateAlliance(id int, name, aType string) error {
	_, err := s.db.Exec("UPDATE alliances SET name = ?, type = ? WHERE id = ?", name, aType, id)
	return err
}

func (s *Store) DeleteAlliance(id int) error {
	_, err := s.db.Exec("DELETE FROM alliances WHERE id = ?", id)
	return err
}
