export type ForecastLessonStatus =
  | 'planned'
  | 'overdue'
  | 'completed'
  | 'rescheduled'
  | 'canceled'
  | 'teacher_vacation'
  | 'student_vacation'
  | 'holidays';

export type ForecastSlot = {
  id: string;
  student_id: string | null;
  date: string;
  start_time: string;
  status: ForecastLessonStatus;
  source_weekly_slot_id?: string | null;
  student_paid_lessons_left: number | null;
};

export function calculateForecastBySlotId(input: {
  slots: ForecastSlot[];
  studentPaidLessonsById: Map<string, number>;
  plannedBaselineByStudentId: Record<string, number>;
}): Map<string, number> {
  const result = new Map<string, number>();
  const slotsByStudentId = new Map<string, ForecastSlot[]>();

  for (const slot of input.slots) {
    if (!slot.student_id) continue;
    const list = slotsByStudentId.get(slot.student_id) ?? [];
    list.push(slot);
    slotsByStudentId.set(slot.student_id, list);
  }

  for (const [studentId, studentSlots] of slotsByStudentId.entries()) {
    const sorted = [...studentSlots].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return a.id.localeCompare(b.id);
    });

    const slotBalanceSnapshot = sorted.find((slot) => slot.student_paid_lessons_left !== null)?.student_paid_lessons_left;
    const paidLessons = Math.max(0, input.studentPaidLessonsById.get(studentId) ?? Number(slotBalanceSnapshot ?? 0));
    const unconfirmedBeforeCurrentRange = Math.max(0, Number(input.plannedBaselineByStudentId[studentId] ?? 0));
    let forecast = Math.max(0, paidLessons - unconfirmedBeforeCurrentRange);

    for (const slot of sorted) {
      // Intentionally count ALL unconfirmed lessons (planned + overdue),
      // including one-time slots where source_weekly_slot_id is null.
      if (slot.status !== 'planned' && slot.status !== 'overdue') continue;
      result.set(slot.id, forecast);
      forecast = Math.max(0, forecast - 1);
    }
  }

  return result;
}
