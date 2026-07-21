ALTER TABLE players MODIFY COLUMN troop_type enum('None','Brilliant','Exalted','Helios','Apex','Mixed') NOT NULL DEFAULT 'None';
UPDATE players SET troop_type = 'Brilliant' WHERE troop_type = 'Exalted';
ALTER TABLE players MODIFY COLUMN troop_type enum('None','Brilliant','Helios','Apex','Mixed') NOT NULL DEFAULT 'None';
