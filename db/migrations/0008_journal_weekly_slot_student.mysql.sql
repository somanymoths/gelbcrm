ALTER TABLE teacher_weekly_slots
  ADD COLUMN student_id CHAR(36) NULL AFTER teacher_id;

ALTER TABLE teacher_weekly_slots
  ADD KEY idx_teacher_weekly_slots_student (student_id);

ALTER TABLE teacher_weekly_slots
  ADD CONSTRAINT fk_teacher_weekly_slots_student
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
