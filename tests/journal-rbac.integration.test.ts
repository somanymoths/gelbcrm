import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getSlots } from '@/app/api/v1/journal/slots/route';
import { PATCH as patchSlot } from '@/app/api/v1/journal/slots/[id]/route';
import { requireUser } from '@/lib/api-auth';
import { findTeacherByUserId, listTeacherLessonSlots, updateTeacherLessonSlot } from '@/lib/db';

vi.mock('@/lib/api-auth', () => ({
  requireUser: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  findTeacherByUserId: vi.fn(),
  listTeacherLessonSlots: vi.fn(),
  createTeacherLessonSlot: vi.fn(),
  updateTeacherLessonSlot: vi.fn(),
  deleteTeacherLessonSlot: vi.fn()
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindTeacherByUserId = vi.mocked(findTeacherByUserId);
const mockedListTeacherLessonSlots = vi.mocked(listTeacherLessonSlots);
const mockedUpdateTeacherLessonSlot = vi.mocked(updateTeacherLessonSlot);

describe('Journal RBAC integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('teacher always receives own journal even with foreign teacherId in query', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'user-teacher-1', role: 'teacher', login: 'teacher1' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedFindTeacherByUserId.mockResolvedValue({
      id: 'teacher-own-1',
      first_name: 'Own',
      last_name: 'Teacher',
      full_name: 'Own Teacher'
    });
    mockedListTeacherLessonSlots.mockResolvedValue([]);

    const response = await getSlots(
      new Request(
        'http://localhost/api/v1/journal/slots?teacherId=teacher-foreign-2&dateFrom=2026-03-16&dateTo=2026-03-22'
      )
    );

    expect(response.status).toBe(200);
    expect(mockedListTeacherLessonSlots).toHaveBeenCalledWith({
      teacherId: 'teacher-own-1',
      dateFrom: '2026-03-16',
      dateTo: '2026-03-22'
    });
  });

  it('teacher updates slot only within own scope even if payload has foreign teacherId', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'user-teacher-2', role: 'teacher', login: 'teacher2' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedFindTeacherByUserId.mockResolvedValue({
      id: 'teacher-own-2',
      first_name: 'Own',
      last_name: 'Teacher',
      full_name: 'Own Teacher'
    });
    mockedUpdateTeacherLessonSlot.mockResolvedValue({
      id: 'slot-1',
      teacher_id: 'teacher-own-2',
      student_id: null,
      student_full_name: null,
      student_paid_lessons_left: null,
      date: '2026-03-17',
      start_time: '10:00',
      status: 'planned',
      rescheduled_to_slot_id: null,
      source_weekly_slot_id: null
    });

    const response = await patchSlot(
      new Request('http://localhost/api/v1/journal/slots/slot-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 'teacher-foreign-2',
          date: '2026-03-17',
          startTime: '10:00'
        })
      }),
      { params: Promise.resolve({ id: 'slot-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockedUpdateTeacherLessonSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'slot-1',
        teacherId: 'teacher-own-2',
        actorUserId: 'user-teacher-2'
      })
    );
  });

  it('admin can request journal for selected teacher', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedListTeacherLessonSlots.mockResolvedValue([]);

    const response = await getSlots(
      new Request('http://localhost/api/v1/journal/slots?teacherId=teacher-selected-7&dateFrom=2026-03-16&dateTo=2026-03-22')
    );

    expect(response.status).toBe(200);
    expect(mockedFindTeacherByUserId).not.toHaveBeenCalled();
    expect(mockedListTeacherLessonSlots).toHaveBeenCalledWith({
      teacherId: 'teacher-selected-7',
      dateFrom: '2026-03-16',
      dateTo: '2026-03-22'
    });
  });

  it('returns 404 when teacher account has no linked teacher profile', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'user-teacher-3', role: 'teacher', login: 'teacher3' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedFindTeacherByUserId.mockResolvedValue(null);

    const response = await getSlots(
      new Request('http://localhost/api/v1/journal/slots?teacherId=teacher-any&dateFrom=2026-03-16&dateTo=2026-03-22')
    );

    expect(response.status).toBe(404);
    expect(mockedListTeacherLessonSlots).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: 'TEACHER_PROFILE_NOT_FOUND'
    });
  });
});
