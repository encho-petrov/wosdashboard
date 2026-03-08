CREATE TABLE discord_guilds (
    guild_id VARCHAR(255) PRIMARY KEY,
    alliance_id INT DEFAULT NULL,
    guild_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_discord_alliance FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE
);

CREATE TABLE discord_routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alliance_id INT DEFAULT NULL,
    event_type VARCHAR(50) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    ping_role_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_alliance FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
    UNIQUE KEY unique_alliance_event (alliance_id, event_type)
);

CREATE TABLE discord_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alliance_id INT DEFAULT NULL,
    job_name VARCHAR(100) NOT NULL,
    cron_expression VARCHAR(100) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    message_payload JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_schedule_alliance FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE
);