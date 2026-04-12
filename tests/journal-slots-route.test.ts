import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getSlots } from '@/app/api/v1/journal/slots/route';
import { requireUser } from '@/lib/api-auth';
import { getTeacherRateRub, listTeacherLessonSlots, listTeacherPlannedSlotCountsBeforeDate } from '@/lib/db';
import { getVacationOverlayBySlotIds, listVacationPlannedCountsBeforeDate } from '@/lib/journal-vacations';

vi.mock('@/lib/api-auth', () => ({
  requireUser: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  findTeacherByUserId: vi.fn(),
  createTeacherLessonSlot: vi.fn(),
  listTeacherLessonSlots: vi.fn(),
  listTeacherPlannedSlotCountsBeforeDate: vi.fn(),
  getTeacherRateRub: vi.fn()
}));

vi.mock('@/lib/journal-vacations', () => ({
  getVacationOverlayBySlotIds: vi.fn(),
  listVacationPlannedCountsBeforeDate: vi.fn()
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedListTeacherLessonSlots = vi.mocked(listTeacherLessonSlots);
const mockedListTeacherPlannedSlotCountsBeforeDate = vi.mocked(listTeacherPlannedSlotCountsBeforeDate);
const mockedGetTeacherRateRub = vi.mocked(getTeacherRateRub);
const mockedGetVacationOverlayBySlotIds = vi.mocked(getVacationOverlayBySlotIds);
const mockedListVacationPlannedCountsBeforeDate = vi.mocked(listVacationPlannedCountsBeforeDate);

describe('Journal slots route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetVacationOverlayBySlotIds.mockResolvedValue(new Map());
    mockedListVacationPlannedCountsBeforeDate.mockResolvedValue([]);
  });

  it('returns weeklyKpi in includeBaseline payload', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    } as Awaited<ReturnType<typeof requireUser>>);

    mockedListTeacherLessonSlots.mockResolvedValue([
      {
        id: 'slot-1',
        teacher_id: 'teacher-1',
        student_id: 'student-1',
        student_full_name: 'Student One',
        student_paid_lessons_left: 5,
        date: '2026-03-30',
        start_time: '10:00',
        status: 'completed',
        rescheduled_to_slot_id: null,
        source_weekly_slot_id: 'weekly-1',
        lock_version: 1
      },
      {
        id: 'slot-2',
        teacher_id: 'teacher-1',
        student_id: 'student-2',
        student_full_name: 'Student Two',
        student_paid_lessons_left: 3,
        date: '2026-03-31',
        start_time: '11:00',
        status: 'planned',
        rescheduled_to_slot_id: null,
        source_weekly_slot_id: 'weekly-2',
        lock_version: 1
      },
      {
        id: 'slot-3',
        teacher_id: 'teacher-1',
        student_id: 'student-3',
        student_full_name: 'Student Three',
        student_paid_lessons_left: 2,
        date: '2026-04-01',
        start_time: '12:00',
        status: 'canceled',
        rescheduled_to_slot_id: null,
        source_weekly_slot_id: 'weekly-3',
        lock_version: 1
      }
    ]);

    mockedListTeacherPlannedSlotCountsBeforeDate.mockResolvedValue([{ student_id: 'student-1', planned_count: 2 }]);
    mockedGetTeacherRateRub.mockResolvedValue(1000);

    const response = await getSlots(
      new Request(
        'http://localhost/api/v1/journal/slots?teacherId=teacher-1&dateFrom=2026-03-30&dateTo=2026-04-05&includeBaseline=1'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      baseline: [{ student_id: 'student-1', planned_count: 2 }],
      weeklyKpi: {
        forecast: { amount: 3000, count: 3 },
        fact: { amount: 1000, count: 1 },
        cancellations: { amount: 1000, count: 1 }
      }
    });
  });

  it('subtracts vacation planned counts from baseline', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    } as Awaited<ReturnType<typeof requireUser>>);

    mockedListTeacherLessonSlots.mockResolvedValue([]);
    mockedListTeacherPlannedSlotCountsBeforeDate.mockResolvedValue([{ student_id: 'student-1', planned_count: 9 }]);
    mockedListVacationPlannedCountsBeforeDate.mockResolvedValue([{ student_id: 'student-1', planned_count: 3 }]);
    mockedGetTeacherRateRub.mockResolvedValue(1000);

    const response = await getSlots(
      new Request(
        'http://localhost/api/v1/journal/slots?teacherId=teacher-1&dateFrom=2026-03-30&dateTo=2026-04-05&includeBaseline=1'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      baseline: [{ student_id: 'student-1', planned_count: 6 }]
    });
  });
});
