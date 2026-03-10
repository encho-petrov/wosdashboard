ALTER TABLE discord_custom_crons
DROP COLUMN next_run_time,
DROP COLUMN recurrence_type,
DROP COLUMN recurrence_config,
ADD COLUMN cron_expression VARCHAR(255) NOT NULL;