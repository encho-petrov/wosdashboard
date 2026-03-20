CREATE TABLE IF NOT EXISTS building_rewards (
    id INT NOT NULL AUTO_INCREMENT,
    building_id INT NOT NULL,
    week_number INT NOT NULL,
    reward_name VARCHAR(100),
    reward_icon VARCHAR(100),
    PRIMARY KEY (id),
    FOREIGN KEY (building_id) REFERENCES buildings(id)
);

CREATE TABLE IF NOT EXISTS rotation_schedule (
    id INT NOT NULL AUTO_INCREMENT,
    season_id INT NOT NULL DEFAULT 1,
    week_number INT NOT NULL,
    building_id INT NOT NULL,
    alliance_id INT,
    PRIMARY KEY (id),
    FOREIGN KEY (building_id) REFERENCES buildings(id),
    FOREIGN KEY (alliance_id) REFERENCES alliances(id),
    UNIQUE (season_id, week_number, building_id)
);