import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postSlotStatus } from '@/app/api/v1/journal/slots/[id]/status/route';
import { requireUser } from '@/lib/api-auth';
import { findTeacherByUserId, getTeacherLessonSlotStudentId, updateTeacherLessonSlotStatus } from '@/lib/db';

vi.mock('@/lib/api-auth', () => ({
  requireUser: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  findTeacherByUserId: vi.fn(),
  getTeacherLessonSlotStudentId: vi.fn(),
  updateTeacherLessonSlotStatus: vi.fn()
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindTeacherByUserId = vi.mocked(findTeacherByUserId);
const mockedGetTeacherLessonSlotStudentId = vi.mocked(getTeacherLessonSlotStudentId);
const mockedUpdateTeacherLessonSlotStatus = vi.mocked(updateTeacherLessonSlotStatus);

describe('Journal status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTeacherLessonSlotStudentId.mockResolvedValue(null);
  });

  it('returns teacher/admin conflict message and 409', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'teacher-user-1', role: 'teacher', login: 'teacher1' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedFindTeacherByUserId.mockResolvedValue({
      id: 'teacher-1',
      first_name: 'Teacher',
      last_name: 'One',
      full_name: 'Teacher One'
    });
    mockedUpdateTeacherLessonSlotStatus.mockRejectedValue(new Error('SLOT_CONFLICT_ADMIN_WON'));

    const response = await postSlotStatus(
      new Request('http://localhost/api/v1/journal/slots/slot-1/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 'teacher-other',
          status: 'completed',
          expectedLockVersion: 11
        })
      }),
      { params: Promise.resolve({ id: 'slot-1' }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SLOT_CONFLICT_ADMIN_WON'
    });
    expect(mockedUpdateTeacherLessonSlotStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 'teacher-1',
        actorRole: 'teacher',
        expectedLockVersion: 11
      })
    );
  });

  it('maps future day completion guard', async () => {
    mockedRequireUser.mockResolvedValue({
      session: { id: 'teacher-user-2', role: 'teacher', login: 'teacher2' }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedFindTeacherByUserId.mockResolvedValue({
      id: 'teacher-2',
      first_name: 'Teacher',
      last_name: 'Two',
      full_name: 'Teacher Two'
    });
    mockedUpdateTeacherLessonSlotStatus.mockRejectedValue(new Error('SLOT_COMPLETED_FUTURE_DATE_FORBIDDEN'));

    const response = await postSlotStatus(
      new Request('http://localhost/api/v1/journal/slots/slot-2/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed'
        })
      }),
      { params: Promise.resolve({ id: 'slot-2' }) }
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SLOT_COMPLETED_FUTURE_DATE_FORBIDDEN'
    });
  });
});
