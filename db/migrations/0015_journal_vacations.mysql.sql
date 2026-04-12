CREATE TABLE IF NOT EXISTS journal_vacations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  vacation_type ENUM('teacher', 'student', 'holidays') NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  comment_text VARCHAR(500) NULL,
  target_student_ids_json JSON NOT NULL,
  target_students_snapshot_json JSON NOT NULL,
  applied_slots_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canceled_at TIMESTAMP NULL DEFAULT NULL,
  canceled_by_user_id CHAR(36) NULL,
  ended_early_at TIMESTAMP NULL DEFAULT NULL,
  ended_early_by_user_id CHAR(36) NULL,
  ended_early_date DATE NULL,
  modified_by_user_id CHAR(36) NULL,
  modified_at TIMESTAMP NULL DEFAULT NULL,
  modification_type ENUM('cancel', 'early_finish') NULL,
  CONSTRAINT fk_journal_vacations_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_vacations_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_journal_vacations_canceled_by FOREIGN KEY (canceled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_vacations_ended_early_by FOREIGN KEY (ended_early_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_vacations_modified_by FOREIGN KEY (modified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_journal_vacations_dates CHECK (date_from <= date_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_journal_vacations_teacher_created
  ON journal_vacations (teacher_id, created_at DESC, id DESC);

CREATE INDEX idx_journal_vacations_teacher_dates
  ON journal_vacations (teacher_id, date_from, date_to);

CREATE TABLE IF NOT EXISTS journal_vacation_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vacation_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  slot_id CHAR(36) NOT NULL,
  slot_date DATE NOT NULL,
  slot_start_time TIME NOT NULL,
  student_id CHAR(36) NULL,
  student_full_name VARCHAR(255) NULL,
  vacation_status ENUM('teacher_vacation', 'student_vacation', 'holidays') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journal_vacation_slots_vacation_slot (vacation_id, slot_id),
  KEY idx_journal_vacation_slots_teacher_date_active (teacher_id, slot_date, is_active),
  KEY idx_journal_vacation_slots_vacation_active (vacation_id, is_active),
  KEY idx_journal_vacation_slots_slot_active (slot_id, is_active),
  CONSTRAINT fk_journal_vacation_slots_vacation FOREIGN KEY (vacation_id) REFERENCES journal_vacations(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_vacation_slots_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_vacation_slots_slot FOREIGN KEY (slot_id) REFERENCES lesson_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_vacation_slots_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
