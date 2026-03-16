DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pet_skill_schedule;

CREATE TABLE IF NOT EXISTS alliances (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50), type VARCHAR(20) DEFAULT 'Fighting', is_locked BOOLEAN DEFAULT FALSE);
CREATE TABLE IF NOT EXISTS teams (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50), captain_fid BIGINT, fighting_alliance_id INT NULL, alliance_id INT NULL);

CREATE TABLE IF NOT EXISTS players (
    player_id BIGINT PRIMARY KEY,
    nickname VARCHAR(50),
    avatar_image VARCHAR(255),
    stove_lv INT DEFAULT 0,
    stove_lv_content VARCHAR(255),
    tundra_power BIGINT DEFAULT 0,
    normal_power BIGINT DEFAULT 0,
    troop_type ENUM('Infantry', 'Lancer', 'Marksman', 'None') DEFAULT 'None',
    battle_availability ENUM('Available', 'Unavailable') DEFAULT 'Available',
    avail_0200 BOOLEAN DEFAULT FALSE,
    avail_1200 BOOLEAN DEFAULT FALSE,
    avail_1400 BOOLEAN DEFAULT FALSE,
    avail_1900 BOOLEAN DEFAULT FALSE,
    alliance_id INT NULL,
    team_id INT NULL,
    fighting_alliance_id INT NULL,
    kid INT DEFAULT 0,
    last_api_refresh TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS war_room_state (id INT PRIMARY KEY DEFAULT 1, active_event_type VARCHAR(50) DEFAULT NULL);
INSERT IGNORE INTO war_room_state (id, active_event_type) VALUES (1, NULL);
CREATE TABLE IF NOT EXISTS war_room_attendance (id INT AUTO_INCREMENT PRIMARY KEY, fid BIGINT NOT NULL, event_type VARCHAR(50) NOT NULL, status VARCHAR(20) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS event_snapshots (id INT AUTO_INCREMENT PRIMARY KEY, event_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(50), notes VARCHAR(255));
CREATE TABLE IF NOT EXISTS history_teams (id INT AUTO_INCREMENT PRIMARY KEY, event_id INT, original_team_id INT, name VARCHAR(50), captain_fid BIGINT NULL, fighting_alliance_id INT NULL);
CREATE TABLE IF NOT EXISTS history_players (id INT AUTO_INCREMENT PRIMARY KEY, event_id INT, player_id BIGINT, nickname VARCHAR(50), alliance_id INT NULL, team_id INT NULL, fighting_alliance_id INT NULL);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50),
    password_hash VARCHAR(255) DEFAULT '',
    role VARCHAR(20) DEFAULT 'User',
    alliance_id INT NULL,
    mfa_secret VARCHAR(255) DEFAULT '',
    mfa_enabled BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT, action VARCHAR(50), details TEXT, ip_address VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS webauthn_credentials (user_id INT, credential_id BLOB, credential_data TEXT);

CREATE TABLE IF NOT EXISTS alliance_transfers (id INT AUTO_INCREMENT PRIMARY KEY, target_user_id BIGINT, requested_by BIGINT, from_alliance_id INT NULL, to_alliance_id INT NULL, status VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP NULL, resolved_by BIGINT NULL);
CREATE TABLE IF NOT EXISTS discord_guilds (guild_id VARCHAR(50) PRIMARY KEY, alliance_id INT UNIQUE NULL, guild_name VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discord_routes (id INT AUTO_INCREMENT PRIMARY KEY, alliance_id INT NULL, event_type VARCHAR(50), channel_id VARCHAR(50), ping_role_id VARCHAR(50) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discord_schedules (id INT AUTO_INCREMENT PRIMARY KEY, alliance_id INT NULL, job_name VARCHAR(100), cron_expression VARCHAR(50), channel_id VARCHAR(50), message_payload TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discord_configs (id INT AUTO_INCREMENT PRIMARY KEY, alliance_id INT NULL, guild_id VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discord_custom_crons (id INT AUTO_INCREMENT PRIMARY KEY, alliance_id INT NULL, name VARCHAR(100), channel_id VARCHAR(50), next_run_time DATETIME, recurrence_type VARCHAR(20), recurrence_config JSON, message TEXT, ping_role_id VARCHAR(50) NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS pet_skill_schedule (id INT AUTO_INCREMENT PRIMARY KEY, fight_date DATE, slot_id INT, captain_fid BIGINT);
CREATE TABLE IF NOT EXISTS buildings (id INT PRIMARY KEY, internal_id INT, type VARCHAR(50));
CREATE TABLE IF NOT EXISTS building_rewards (building_id INT, week_number INT, reward_name VARCHAR(50), reward_icon VARCHAR(100));
CREATE TABLE IF NOT EXISTS rotation_schedule (season_id INT, week_number INT, building_id INT, alliance_id INT);
CREATE TABLE IF NOT EXISTS alliance_event_legions (alliance_id INT, event_type VARCHAR(50), legion_id INT, is_locked BOOLEAN DEFAULT FALSE, PRIMARY KEY (alliance_id, event_type, legion_id));
CREATE TABLE IF NOT EXISTS alliance_event_roster (alliance_id INT, event_type VARCHAR(50), player_id BIGINT, legion_id INT, is_sub BOOLEAN DEFAULT FALSE, attendance VARCHAR(20) DEFAULT 'Pending', PRIMARY KEY (alliance_id, event_type, player_id));
CREATE TABLE IF NOT EXISTS alliance_event_history (id INT AUTO_INCREMENT PRIMARY KEY, alliance_id INT, event_type VARCHAR(50), created_by VARCHAR(50), notes VARCHAR(255), event_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS alliance_event_history_players (id INT AUTO_INCREMENT PRIMARY KEY, history_id INT, player_id BIGINT, nickname VARCHAR(50), legion_id INT, is_sub BOOLEAN, attendance VARCHAR(20));
CREATE TABLE IF NOT EXISTS player_gift_codes (player_id BIGINT, gift_code VARCHAR(50), redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (player_id, gift_code));
CREATE TABLE IF NOT EXISTS jobs (job_id VARCHAR(50) PRIMARY KEY, initiated_by_user_id BIGINT NULL, gift_codes TEXT, status VARCHAR(20), total_players INT, processed_players INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP NULL, report_path VARCHAR(255) NULL);
CREATE TABLE IF NOT EXISTS ministry_events (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100), status VARCHAR(20), announce_enabled BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP NULL);
CREATE TABLE IF NOT EXISTS ministry_days (id INT AUTO_INCREMENT PRIMARY KEY, event_id INT, buff_name VARCHAR(50), active_date VARCHAR(20));
CREATE TABLE IF NOT EXISTS ministry_slots (id INT AUTO_INCREMENT PRIMARY KEY, day_id INT, slot_index INT, player_fid BIGINT NULL);

CREATE TABLE IF NOT EXISTS heroes (id INT PRIMARY KEY, name VARCHAR(50), troop_type VARCHAR(20), local_image_path VARCHAR(255));
CREATE TABLE IF NOT EXISTS battle_strategy (id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(20), infantry_ratio INT, lancer_ratio INT, marksman_ratio INT, is_active BOOLEAN, map_data TEXT);
CREATE TABLE IF NOT EXISTS battle_strategy_heroes (strategy_id INT, hero_id INT, role VARCHAR(20), slot_position INT);

CREATE TABLE IF NOT EXISTS transfer_seasons (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), power_cap BIGINT, is_leading BOOLEAN, special_invites_available INT, normal_invites_available INT, status VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP NULL);
CREATE TABLE IF NOT EXISTS transfer_records (id INT AUTO_INCREMENT PRIMARY KEY, season_id INT, fid BIGINT, direction VARCHAR(20), nickname VARCHAR(50), furnace_level INT DEFAULT 0, power BIGINT DEFAULT 0, source_state VARCHAR(20), target_alliance_id INT NULL, invite_type VARCHAR(20) DEFAULT '', status VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, avatar VARCHAR(255) DEFAULT '', furnace_image VARCHAR(255) DEFAULT '');