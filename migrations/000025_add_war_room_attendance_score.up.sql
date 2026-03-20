CREATE TABLE IF NOT EXISTS war_room_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fid BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'SvS', 'Tyrant', 'Tundra'
    status VARCHAR(20) NOT NULL,     -- 'Attended', 'Missed', 'Exempt'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fid_event (fid, event_type)
);