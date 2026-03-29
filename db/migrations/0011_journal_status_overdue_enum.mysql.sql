ALTER TABLE lesson_slots
  MODIFY COLUMN status ENUM('planned', 'overdue', 'completed', 'rescheduled', 'canceled') NOT NULL DEFAULT 'planned';

UPDATE lesson_slots
SET status = CASE
  WHEN date < DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) THEN 'overdue'
  ELSE 'planned'
END
WHERE status = '';
