ALTER TABLE students
  ADD COLUMN entity_type ENUM('lead', 'student') NOT NULL DEFAULT 'lead' AFTER id,
  ADD COLUMN lead_source VARCHAR(191) NULL AFTER email,
  ADD COLUMN card_comment TEXT NULL AFTER lead_source,
  ADD COLUMN next_lesson_at TIMESTAMP NULL AFTER card_comment,
  ADD COLUMN start_lessons_at DATE NULL AFTER next_lesson_at,
  ADD COLUMN last_lesson_at DATE NULL AFTER start_lessons_at,
  ADD COLUMN paid_lessons_left INT NOT NULL DEFAULT 0 AFTER last_lesson_at,
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN archived_by CHAR(36) NULL AFTER deleted_at,
  ADD COLUMN active_scope TINYINT AS (IF(deleted_at IS NULL, 1, NULL)) STORED;

ALTER TABLE students
  DROP INDEX uq_students_phone,
  DROP INDEX uq_students_email;

CREATE UNIQUE INDEX uq_students_phone_active ON students (phone, active_scope);
CREATE UNIQUE INDEX uq_students_email_active ON students (email, active_scope);
CREATE INDEX idx_students_deleted_at ON students (deleted_at);
CREATE INDEX idx_students_next_lesson_at ON students (next_lesson_at);

CREATE TABLE IF NOT EXISTS funnel_loss_reasons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_funnel_loss_reasons_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO funnel_loss_reasons (name)
VALUES
  ('Высокая стоимость'),
  ('Не подошел формат обучения'),
  ('Нет времени'),
  ('Пропал контакт'),
  ('Другое')
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS funnel_loss_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  stage_id SMALLINT NOT NULL,
  reason_id BIGINT UNSIGNED NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_funnel_loss_events_student (student_id, created_at),
  CONSTRAINT fk_funnel_loss_events_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_funnel_loss_events_stage FOREIGN KEY (stage_id) REFERENCES funnel_stages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_funnel_loss_events_reason FOREIGN KEY (reason_id) REFERENCES funnel_loss_reasons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  stage_id SMALLINT NULL,
  body TEXT NOT NULL,
  author_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_student_comments_student (student_id, created_at),
  CONSTRAINT fk_student_comments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_comments_stage FOREIGN KEY (stage_id) REFERENCES funnel_stages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tariff_packages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tariff_grid_id CHAR(36) NOT NULL,
  lessons_count INT NOT NULL,
  price_per_lesson_rub DECIMAL(12,2) NOT NULL,
  total_price_rub DECIMAL(12,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tariff_packages_grid_active (tariff_grid_id, is_active),
  CONSTRAINT fk_tariff_packages_grid FOREIGN KEY (tariff_grid_id) REFERENCES tariff_grids(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_payment_links (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  tariff_grid_id CHAR(36) NOT NULL,
  tariff_package_id CHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'yookassa',
  provider_payment_id VARCHAR(128) NOT NULL,
  payment_url TEXT NOT NULL,
  status ENUM('pending', 'paid', 'failed', 'expired') NOT NULL DEFAULT 'pending',
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  expires_at TIMESTAMP NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_payment_links_provider_payment (provider_payment_id),
  KEY idx_student_payment_links_student (student_id, created_at),
  CONSTRAINT fk_student_payment_links_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_payment_links_grid FOREIGN KEY (tariff_grid_id) REFERENCES tariff_grids(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_payment_links_package FOREIGN KEY (tariff_package_id) REFERENCES tariff_packages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
