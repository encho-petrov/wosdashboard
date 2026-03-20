CREATE TABLE `alliance_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `target_user_id` bigint NOT NULL,
  `requested_by` bigint NOT NULL,
  `from_alliance_id` int DEFAULT NULL,
  `to_alliance_id` int DEFAULT NULL,
  `status` enum('Pending','Approved','Declined') NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_transfers_target_user` (`target_user_id`),
  KEY `fk_transfers_to_alliance` (`to_alliance_id`),
  CONSTRAINT `fk_transfers_to_alliance` FOREIGN KEY (`to_alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;