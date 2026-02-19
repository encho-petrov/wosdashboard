CREATE TABLE IF NOT EXISTS alliances (
    id int NOT NULL AUTO_INCREMENT,
    name varchar(50) NOT NULL,
    type enum('General','Fighting') DEFAULT 'General',
    is_locked tinyint(1) DEFAULT '0',
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id varchar(50) NOT NULL,
    initiated_by_user_id int DEFAULT NULL,
    gift_codes text,
    status enum('pending','running','completed','failed') DEFAULT 'pending',
    total_players int DEFAULT '0',
    processed_players int DEFAULT '0',
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    completed_at datetime DEFAULT NULL,
    report_path varchar(255) DEFAULT NULL,
    PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS teams (
    id int NOT NULL AUTO_INCREMENT,
    name varchar(50) NOT NULL,
    alliance_id int NOT NULL,
    captain_fid bigint DEFAULT NULL,
    fighting_alliance_id int DEFAULT NULL,
    PRIMARY KEY (id),
    KEY alliance_id (alliance_id),
    KEY fk_team_fighting_alliance (fighting_alliance_id),
    CONSTRAINT fk_team_fighting_alliance FOREIGN KEY (fighting_alliance_id) REFERENCES alliances (id) ON DELETE CASCADE,
    CONSTRAINT teams_ibfk_1 FOREIGN KEY (alliance_id) REFERENCES alliances (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
    player_id bigint NOT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    nickname varchar(50) DEFAULT NULL,
    avatar_image varchar(255) DEFAULT NULL,
    stove_lv int DEFAULT '0',
    stove_lv_content varchar(255) DEFAULT NULL,
    kid int DEFAULT '0',
    troop_type enum('None','Brilliant','Helios','Apex','Mixed') NOT NULL DEFAULT 'None',
    tundra_power bigint DEFAULT '0',
    alliance_id int DEFAULT NULL,
    team_id int DEFAULT NULL,
    last_api_refresh datetime DEFAULT CURRENT_TIMESTAMP,
    battle_availability enum('Full','4h+','3-4h','2-3h','<2h','Unavailable') DEFAULT 'Unavailable',
    tundra_availability enum('Full','Partial','Unavailable') DEFAULT 'Unavailable',
    fighting_alliance_id int DEFAULT NULL,
    PRIMARY KEY (player_id),
    KEY fk_player_alliance (alliance_id),
    KEY fk_player_team (team_id),
    KEY fk_player_fighting_alliance (fighting_alliance_id),
    CONSTRAINT fk_player_alliance FOREIGN KEY (alliance_id) REFERENCES alliances (id) ON DELETE SET NULL,
    CONSTRAINT fk_player_fighting_alliance FOREIGN KEY (fighting_alliance_id) REFERENCES alliances (id) ON DELETE SET NULL,
    CONSTRAINT fk_player_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS users (
    id int NOT NULL AUTO_INCREMENT,
    username varchar(50) NOT NULL,
    password_hash varchar(255) NOT NULL,
    role enum('admin','moderator') NOT NULL DEFAULT 'moderator',
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    alliance_id int DEFAULT NULL,
    mfa_secret varchar(255) DEFAULT '',
    mfa_enabled tinyint(1) DEFAULT '0',
    PRIMARY KEY (id),
    UNIQUE KEY username (username),
    KEY fk_user_alliance (alliance_id),
    CONSTRAINT fk_user_alliance FOREIGN KEY (alliance_id) REFERENCES alliances (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id int NOT NULL AUTO_INCREMENT,
    user_id int DEFAULT NULL,
    action varchar(100) DEFAULT NULL,
    details text,
    ip_address varchar(45) DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY user_id (user_id),
    CONSTRAINT audit_logs_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS player_gift_codes (
    player_id bigint NOT NULL,
    gift_code varchar(128) NOT NULL,
    redeemed_at datetime DEFAULT CURRENT_TIMESTAMP,
    KEY idx_player_id (player_id),
    KEY idx_gift_code (gift_code),
    KEY idx_player_code (player_id,gift_code),
    CONSTRAINT player_gift_codes_ibfk_1 FOREIGN KEY (player_id) REFERENCES players (player_id) ON DELETE CASCADE
);