CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  role ENUM('admin', 'teacher') NOT NULL,
  login VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teachers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  full_name VARCHAR(191) NOT NULL,
  phone VARCHAR(64) NULL,
  contact_link VARCHAR(255) NULL,
  language VARCHAR(128) NULL,
  lesson_rate_rub DECIMAL(12,2) NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teachers_user (user_id),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS funnel_stages (
  id SMALLINT NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  sort_order SMALLINT NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO funnel_stages (id, code, name, sort_order)
VALUES
  (1, 'interested', 'Заинтересовался', 1),
  (2, 'qualification', 'Квалификация', 2),
  (3, 'meeting', 'Знакомство', 3),
  (4, 'payment', 'Оплата', 4),
  (5, 'on_lessons', 'На занятиях', 5),
  (6, 'last_lesson', 'Последнее занятие', 6),
  (7, 'declined', 'Отказался', 7),
  (8, 'stopped', 'Перестал заниматься', 8)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order);

CREATE TABLE IF NOT EXISTS tariff_grids (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tariff_grids_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) NOT NULL PRIMARY KEY,
  first_name VARCHAR(191) NOT NULL,
  last_name VARCHAR(191) NOT NULL,
  contact_link VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(191) NULL,
  assigned_teacher_id CHAR(36) NULL,
  current_funnel_stage_id SMALLINT NOT NULL,
  primary_tariff_grid_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_students_phone (phone),
  UNIQUE KEY uq_students_email (email),
  KEY idx_students_stage (current_funnel_stage_id),
  KEY idx_students_teacher (assigned_teacher_id),
  CONSTRAINT fk_students_teacher FOREIGN KEY (assigned_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_stage FOREIGN KEY (current_funnel_stage_id) REFERENCES funnel_stages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_students_primary_tariff_grid FOREIGN KEY (primary_tariff_grid_id) REFERENCES tariff_grids(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
