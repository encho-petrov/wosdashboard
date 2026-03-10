ALTER TABLE discord_custom_crons
ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT 'Unnamed Event';