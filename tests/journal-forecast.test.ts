import { describe, expect, it } from 'vitest';
import { calculateForecastBySlotId, type ForecastSlot } from '@/lib/journal-forecast';

describe('journal forecast', () => {
  it('counts one-time planned lessons in the forecast chain', () => {
    const studentId = 'student-1';
    const slots: ForecastSlot[] = [
      {
        id: 'weekly-1',
        student_id: studentId,
        date: '2026-03-30',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 5
      },
      {
        id: 'one-time-1',
        student_id: studentId,
        date: '2026-03-31',
        start_time: '12:00',
        status: 'planned',
        source_weekly_slot_id: null,
        student_paid_lessons_left: 5
      },
      {
        id: 'weekly-2',
        student_id: studentId,
        date: '2026-04-01',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 5
      }
    ];

    const forecast = calculateForecastBySlotId({
      slots,
      studentPaidLessonsById: new Map([[studentId, 5]]),
      plannedBaselineByStudentId: {}
    });

    expect(forecast.get('weekly-1')).toBe(5);
    expect(forecast.get('one-time-1')).toBe(4);
    expect(forecast.get('weekly-2')).toBe(3);
  });

  it('does not include non-planned slots in the decrement chain', () => {
    const studentId = 'student-2';
    const slots: ForecastSlot[] = [
      {
        id: 'planned-1',
        student_id: studentId,
        date: '2026-03-30',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 3
      },
      {
        id: 'canceled-1',
        student_id: studentId,
        date: '2026-03-31',
        start_time: '10:00',
        status: 'canceled',
        source_weekly_slot_id: null,
        student_paid_lessons_left: 3
      },
      {
        id: 'planned-2',
        student_id: studentId,
        date: '2026-04-01',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: null,
        student_paid_lessons_left: 3
      }
    ];

    const forecast = calculateForecastBySlotId({
      slots,
      studentPaidLessonsById: new Map([[studentId, 3]]),
      plannedBaselineByStudentId: {}
    });

    expect(forecast.get('planned-1')).toBe(3);
    expect(forecast.has('canceled-1')).toBe(false);
    expect(forecast.get('planned-2')).toBe(2);
  });

  it('does not include vacation statuses in the decrement chain', () => {
    const studentId = 'student-3';
    const slots: ForecastSlot[] = [
      {
        id: 'planned-1',
        student_id: studentId,
        date: '2026-04-10',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 4
      },
      {
        id: 'vacation-1',
        student_id: studentId,
        date: '2026-04-11',
        start_time: '10:00',
        status: 'teacher_vacation',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 4
      },
      {
        id: 'planned-2',
        student_id: studentId,
        date: '2026-04-12',
        start_time: '10:00',
        status: 'planned',
        source_weekly_slot_id: 'weekly-slot-id',
        student_paid_lessons_left: 4
      }
    ];

    const forecast = calculateForecastBySlotId({
      slots,
      studentPaidLessonsById: new Map([[studentId, 4]]),
      plannedBaselineByStudentId: {}
    });

    expect(forecast.get('planned-1')).toBe(4);
    expect(forecast.has('vacation-1')).toBe(false);
    expect(forecast.get('planned-2')).toBe(3);
  });
});
