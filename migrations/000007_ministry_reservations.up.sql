-- 1. The Main Event Container
CREATE TABLE IF NOT EXISTS ministry_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status ENUM('Planning', 'Active', 'Closed') NOT NULL DEFAULT 'Planning',
    announce_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL
);

-- 2. The 3 Dynamic Buff Days per Event
CREATE TABLE IF NOT EXISTS ministry_days (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    buff_name VARCHAR(50) NOT NULL, -- e.g., 'Construction', 'Research', 'Training'
    active_date DATE NOT NULL,      -- The specific calendar day chosen for this buff
    FOREIGN KEY (event_id) REFERENCES ministry_events(id) ON DELETE CASCADE
);

-- 3. The 48 Time Slots per Day
CREATE TABLE IF NOT EXISTS ministry_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    day_id INT NOT NULL,
    slot_index INT NOT NULL,        -- 0 to 47 (representing 00:00 to 23:30)
    player_fid BIGINT NULL,         -- NULL if empty
    FOREIGN KEY (day_id) REFERENCES ministry_days(id) ON DELETE CASCADE,
    FOREIGN KEY (player_fid) REFERENCES players(player_id) ON DELETE SET NULL,
    UNIQUE KEY unique_day_slot (day_id, slot_index) -- Prevents duplicate slots for the same day
);