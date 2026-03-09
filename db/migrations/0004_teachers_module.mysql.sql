CREATE TABLE IF NOT EXISTS school_languages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_languages_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE teachers
  ADD COLUMN first_name VARCHAR(191) NULL AFTER full_name,
  ADD COLUMN last_name VARCHAR(191) NULL AFTER first_name,
  ADD COLUMN language_id BIGINT UNSIGNED NULL AFTER language,
  ADD COLUMN rate_rub INT NULL AFTER lesson_rate_rub,
  ADD COLUMN telegram_raw VARCHAR(255) NULL AFTER contact_link,
  ADD COLUMN telegram_normalized VARCHAR(191) NULL AFTER telegram_raw,
  ADD COLUMN comment TEXT NULL AFTER timezone,
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD KEY idx_teachers_created_at (created_at),
  ADD KEY idx_teachers_name (last_name, first_name),
  ADD KEY idx_teachers_deleted_at (deleted_at),
  ADD CONSTRAINT fk_teachers_language FOREIGN KEY (language_id) REFERENCES school_languages(id) ON DELETE RESTRICT;

UPDATE teachers
SET
  first_name = COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(full_name, ' ', 1)), ''), full_name),
  last_name = COALESCE(NULLIF(TRIM(SUBSTRING(full_name, LENGTH(SUBSTRING_INDEX(full_name, ' ', 1)) + 1)), ''), ''),
  rate_rub = CASE WHEN lesson_rate_rub IS NULL THEN NULL ELSE ROUND(lesson_rate_rub) END,
  telegram_raw = contact_link,
  telegram_normalized = CASE
    WHEN contact_link IS NULL OR TRIM(contact_link) = '' THEN NULL
    WHEN LOWER(contact_link) REGEXP '^https?://(www\\.)?t\\.me/' THEN LOWER(SUBSTRING_INDEX(contact_link, '/', -1))
    WHEN LEFT(TRIM(contact_link), 1) = '@' THEN LOWER(SUBSTRING(TRIM(contact_link), 2))
    ELSE LOWER(TRIM(contact_link))
  END
WHERE first_name IS NULL OR last_name IS NULL OR rate_rub IS NULL OR telegram_raw IS NULL;

ALTER TABLE teachers
  MODIFY COLUMN first_name VARCHAR(191) NOT NULL,
  MODIFY COLUMN last_name VARCHAR(191) NOT NULL;

INSERT INTO school_languages (name)
SELECT DISTINCT t.language
FROM teachers t
WHERE t.language IS NOT NULL AND TRIM(t.language) <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

UPDATE teachers t
INNER JOIN school_languages sl ON sl.name = t.language
SET t.language_id = sl.id
WHERE t.language IS NOT NULL AND TRIM(t.language) <> '';

CREATE UNIQUE INDEX uq_teachers_phone ON teachers (phone);
CREATE UNIQUE INDEX uq_teachers_telegram_normalized ON teachers (telegram_normalized);
