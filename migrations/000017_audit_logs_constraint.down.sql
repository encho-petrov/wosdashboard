ALTER TABLE audit_logs DROP FOREIGN KEY audit_logs_ibfk_1;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_ibfk_1
FOREIGN KEY (user_id) REFERENCES users (id);