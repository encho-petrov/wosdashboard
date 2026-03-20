CREATE TABLE `heroes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `troop_type` enum('Infantry','Lancer','Marksman','None') NOT NULL DEFAULT 'None',
  `source_url` varchar(255) DEFAULT NULL,
  `local_image_path` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_heroes_name` (`name`)
);

CREATE TABLE `battle_strategy` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('Attack','Defense') NOT NULL,
  `infantry_ratio` int DEFAULT '0',
  `lancer_ratio` int DEFAULT '0',
  `marksman_ratio` int DEFAULT '0',
  `is_active` boolean DEFAULT TRUE,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE `battle_strategy_heroes` (
  `strategy_id` int NOT NULL,
  `hero_id` int NOT NULL,
  `role` enum('Lead','Joiner') NOT NULL,
  `slot_position` int NOT NULL,
  PRIMARY KEY (`strategy_id`, `role`, `slot_position`),
  KEY `fk_bsh_hero` (`hero_id`),
  CONSTRAINT `fk_bsh_strategy` FOREIGN KEY (`strategy_id`) REFERENCES `battle_strategy` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bsh_hero` FOREIGN KEY (`hero_id`) REFERENCES `heroes` (`id`) ON DELETE CASCADE
);

CREATE TABLE `pet_skill_schedule` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fight_date` DATE NOT NULL,
  `slot_id` int NOT NULL, -- 1: 12-14, 2: 14-16, 3: 15:30-17:30
  `captain_fid` bigint NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_unique_schedule` (`fight_date`, `slot_id`, `captain_fid`),
  CONSTRAINT `fk_pet_schedule_captain` FOREIGN KEY (`captain_fid`) REFERENCES `players` (`player_id`) ON DELETE CASCADE
)