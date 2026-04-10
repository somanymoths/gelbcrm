CREATE INDEX idx_lesson_slots_teacher_student_status_date_time
  ON lesson_slots (teacher_id, student_id, status, date, start_time);

CREATE INDEX idx_lesson_slots_teacher_status_student_date
  ON lesson_slots (teacher_id, status, student_id, date);

CREATE INDEX idx_students_deleted_stage_created
  ON students (deleted_at, current_funnel_stage_id, created_at);
