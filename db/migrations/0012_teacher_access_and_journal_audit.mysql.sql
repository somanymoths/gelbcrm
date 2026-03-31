ALTER TABLE teachers
  ADD COLUMN email VARCHAR(191) NULL AFTER phone,
  ADD UNIQUE KEY uq_teachers_email (email);

ALTER TABLE users
  ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER last_login_at;

CREATE INDEX idx_audit_entity_created_id ON audit_logs (entity_type, created_at DESC, id DESC);
