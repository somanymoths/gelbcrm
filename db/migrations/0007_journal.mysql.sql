CREATE TABLE IF NOT EXISTS teacher_weekly_slots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_weekly_slots_unique (teacher_id, weekday, start_time),
  KEY idx_teacher_weekly_slots_teacher (teacher_id, is_active),
  CONSTRAINT fk_teacher_weekly_slots_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT chk_teacher_weekly_slots_weekday CHECK (weekday BETWEEN 1 AND 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_slots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  teacher_id CHAR(36) NOT NULL,
  student_id CHAR(36) NULL,
  source_weekly_slot_id CHAR(36) NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  status ENUM('planned', 'completed', 'rescheduled', 'canceled') NOT NULL DEFAULT 'planned',
  rescheduled_to_slot_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lesson_slots_teacher_datetime (teacher_id, date, start_time),
  KEY idx_lesson_slots_teacher_date (teacher_id, date, start_time),
  KEY idx_lesson_slots_student_date (student_id, date),
  KEY idx_lesson_slots_status (status, date),
  KEY idx_lesson_slots_source_weekly (source_weekly_slot_id),
  CONSTRAINT fk_lesson_slots_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_lesson_slots_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_lesson_slots_source_weekly FOREIGN KEY (source_weekly_slot_id) REFERENCES teacher_weekly_slots(id) ON DELETE SET NULL,
  CONSTRAINT fk_lesson_slots_rescheduled_to FOREIGN KEY (rescheduled_to_slot_id) REFERENCES lesson_slots(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
