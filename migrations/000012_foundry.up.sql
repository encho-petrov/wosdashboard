CREATE TABLE `alliance_event_legions` (
  `alliance_id` int NOT NULL,
  `event_type` enum('Foundry','Canyon') NOT NULL,
  `legion_id` int NOT NULL, -- 1 or 2
  `is_locked` boolean DEFAULT FALSE,
  PRIMARY KEY (`alliance_id`, `event_type`, `legion_id`)
);

CREATE TABLE `alliance_event_roster` (
  `alliance_id` int NOT NULL,
  `event_type` enum('Foundry','Canyon') NOT NULL,
  `player_id` bigint NOT NULL,
  `legion_id` int NOT NULL,
  `is_sub` boolean DEFAULT FALSE,
  `attendance` enum('Pending','Attended','Missed','Exempt') DEFAULT 'Pending',
  PRIMARY KEY (`alliance_id`, `event_type`, `player_id`),
  CONSTRAINT `fk_aer_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`player_id`) ON DELETE CASCADE
);

CREATE TABLE `alliance_event_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alliance_id` int NOT NULL,
  `event_type` enum('Foundry','Canyon') NOT NULL,
  `event_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE `alliance_event_history_players` (
  `id` int NOT NULL AUTO_INCREMENT,
  `history_id` int NOT NULL,
  `player_id` bigint NOT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `legion_id` int NOT NULL,
  `is_sub` boolean DEFAULT FALSE,
  `attendance` enum('Attended','Missed','Exempt') NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_aehp_history` FOREIGN KEY (`history_id`) REFERENCES `alliance_event_history` (`id`) ON DELETE CASCADE
);