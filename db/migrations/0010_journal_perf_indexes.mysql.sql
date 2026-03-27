CREATE INDEX idx_lesson_slots_teacher_date_status_time
  ON lesson_slots (teacher_id, date, status, start_time);

CREATE INDEX idx_lesson_slots_teacher_source_date_status
  ON lesson_slots (teacher_id, source_weekly_slot_id, date, status);

CREATE INDEX idx_lesson_slots_student_status_date_time
  ON lesson_slots (student_id, status, date, start_time);

CREATE INDEX idx_audit_logs_lesson_status_latest
  ON audit_logs (entity_type, action, entity_id, id);
