CREATE TABLE IF NOT EXISTS ministry_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status ENUM('Planning', 'Active', 'Closed') NOT NULL DEFAULT 'Planning',
    announce_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL
);


CREATE TABLE IF NOT EXISTS ministry_days (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    buff_name VARCHAR(50) NOT NULL,
    active_date DATE NOT NULL,
    FOREIGN KEY (event_id) REFERENCES ministry_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ministry_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    day_id INT NOT NULL,
    slot_index INT NOT NULL,
    player_fid BIGINT NULL,
    FOREIGN KEY (day_id) REFERENCES ministry_days(id) ON DELETE CASCADE,
    FOREIGN KEY (player_fid) REFERENCES players(player_id) ON DELETE SET NULL,
    UNIQUE KEY unique_day_slot (day_id, slot_index)
);