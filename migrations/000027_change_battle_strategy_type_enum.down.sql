DELETE FROM battle_strategy WHERE type = 'TacticalMap';
ALTER TABLE battle_strategy MODIFY COLUMN type ENUM('Attack', 'Defense') NOT NULL;