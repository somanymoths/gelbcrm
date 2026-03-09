CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  diff_before JSON NULL,
  diff_after JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  KEY idx_audit_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS funnel_stage_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  old_stage_id SMALLINT NULL,
  new_stage_id SMALLINT NOT NULL,
  changed_by CHAR(36) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_funnel_stage_history_student (student_id, changed_at),
  CONSTRAINT fk_funnel_stage_history_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_funnel_stage_history_old_stage FOREIGN KEY (old_stage_id) REFERENCES funnel_stages(id) ON DELETE SET NULL,
  CONSTRAINT fk_funnel_stage_history_new_stage FOREIGN KEY (new_stage_id) REFERENCES funnel_stages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_teacher_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id CHAR(36) NOT NULL,
  old_teacher_id CHAR(36) NULL,
  new_teacher_id CHAR(36) NULL,
  changed_by CHAR(36) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_student_teacher_history_student (student_id, changed_at),
  CONSTRAINT fk_student_teacher_history_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_teacher_history_old_teacher FOREIGN KEY (old_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_teacher_history_new_teacher FOREIGN KEY (new_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
