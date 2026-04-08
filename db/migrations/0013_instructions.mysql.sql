CREATE TABLE IF NOT EXISTS instructions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(512) NOT NULL,
  title VARCHAR(2048) NOT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  content_json JSON NOT NULL,
  content_html LONGTEXT NOT NULL,
  old_slugs_json JSON NOT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_instructions_slug (slug),
  KEY idx_instructions_status_updated_at (status, updated_at),
  CONSTRAINT fk_instructions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_instructions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_instructions_old_slugs_json_valid CHECK (JSON_VALID(old_slugs_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instruction_acknowledgements (
  instruction_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (instruction_id, teacher_id),
  KEY idx_instruction_ack_teacher_id (teacher_id),
  KEY idx_instruction_ack_acknowledged_at (acknowledged_at),
  CONSTRAINT fk_instruction_ack_instruction FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE,
  CONSTRAINT fk_instruction_ack_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
