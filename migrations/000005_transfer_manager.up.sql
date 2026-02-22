CREATE TABLE IF NOT EXISTS transfer_seasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    power_cap BIGINT NOT NULL DEFAULT 0,
    is_leading BOOLEAN NOT NULL DEFAULT FALSE,
    special_invites_available INT NOT NULL DEFAULT 0,
    status ENUM('Planning', 'Active', 'Closed') NOT NULL DEFAULT 'Planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS transfer_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    season_id INT NOT NULL,
    fid BIGINT NOT NULL,
    direction ENUM('Inbound', 'Outbound') NOT NULL,
    nickname VARCHAR(255) NOT NULL,
    furnace_level INT NOT NULL DEFAULT 0,
    power BIGINT NOT NULL DEFAULT 0,
    source_state VARCHAR(50),
    target_alliance_id INT NULL,
    invite_type ENUM('None', 'Normal', 'Special') NOT NULL DEFAULT 'None',
    status ENUM('Pending', 'Confirmed', 'Declined') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES transfer_seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (target_alliance_id) REFERENCES alliances(id) ON DELETE SET NULL
);

ALTER TABLE players ADD COLUMN status ENUM('Active', 'Archived') NOT NULL DEFAULT 'Active';