CREATE TABLE `event_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE `history_teams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `original_team_id` int NOT NULL,
  `name` varchar(50) NOT NULL,
  `captain_fid` bigint DEFAULT NULL,
  `fighting_alliance_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_history_team_event` FOREIGN KEY (`event_id`) REFERENCES `event_snapshots` (`id`) ON DELETE CASCADE
);

CREATE TABLE `history_players` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `player_id` bigint NOT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `team_id` int DEFAULT NULL,
  `fighting_alliance_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_history_player_event` FOREIGN KEY (`event_id`) REFERENCES `event_snapshots` (`id`) ON DELETE CASCADE
);