ALTER TABLE players MODIFY COLUMN troop_type enum('None','Brilliant','Exalted','Helios','Apex','Mixed') NOT NULL DEFAULT 'None';
UPDATE players SET troop_type = 'Exalted' WHERE troop_type = 'Brilliant';
ALTER TABLE players MODIFY COLUMN troop_type enum('None','Exalted','Helios','Apex','Mixed') NOT NULL DEFAULT 'None';
