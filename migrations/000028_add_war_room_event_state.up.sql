CREATE TABLE IF NOT EXISTS war_room_state (
    id INT PRIMARY KEY DEFAULT 1,
    active_event_type VARCHAR(50) DEFAULT NULL
);

INSERT IGNORE INTO war_room_state (id, active_event_type) VALUES (1, NULL);