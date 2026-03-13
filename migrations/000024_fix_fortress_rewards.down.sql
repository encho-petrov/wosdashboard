-- irreversible data migration on building_rewards
-- this migration fixes data inconsistency and a duplicate row
-- this can not and should not be reversed
SELECT 'This migration cannot be rolled back' AS error;