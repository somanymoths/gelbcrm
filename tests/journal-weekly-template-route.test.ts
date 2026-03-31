import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/v1/journal/weekly-template/route';
import { requireUser } from '@/lib/api-auth';
import { replaceTeacherWeeklyTemplate } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

vi.mock('@/lib/api-auth', () => ({
  requireUser: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  getTeacherWeeklyTemplate: vi.fn(),
  replaceTeacherWeeklyTemplate: vi.fn()
}));

vi.mock('@/lib/idempotency', () => ({
  getIdempotencyKeyFromRequest: vi.fn(() => 'idem-key'),
  runIdempotent: vi.fn(async (_scope: string, _key: string | null, fn: () => Promise<unknown>) => fn())
}));

vi.mock('@/lib/journal', () => ({
  normalizeHmTime: vi.fn((value: string) => value),
  normalizeIsoDate: vi.fn((value: string) => value),
  resolveJournalScope: vi.fn(async () => ({ teacherId: 'teacher-1' }))
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedReplaceTeacherWeeklyTemplate = vi.mocked(replaceTeacherWeeklyTemplate);
const mockedRunIdempotent = vi.mocked(runIdempotent);
const mockedGetIdempotencyKeyFromRequest = vi.mocked(getIdempotencyKeyFromRequest);
const mockedNormalizeHmTime = vi.mocked(normalizeHmTime);
const mockedNormalizeIsoDate = vi.mocked(normalizeIsoDate);
const mockedResolveJournalScope = vi.mocked(resolveJournalScope);
const studentId = '11111111-1111-4111-8111-111111111111';

describe('Journal weekly template route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireUser.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    } as Awaited<ReturnType<typeof requireUser>>);
    mockedGetIdempotencyKeyFromRequest.mockReturnValue('idem-key');
    mockedRunIdempotent.mockImplementation(async (_scope, _key, fn) => fn());
    mockedResolveJournalScope.mockResolvedValue({ teacherId: 'teacher-1', mode: 'admin' });
    mockedNormalizeHmTime.mockImplementation((value) => value);
    mockedNormalizeIsoDate.mockImplementation((value) => value);
  });

  it('returns 409 when startFrom is earlier than last confirmed lesson date', async () => {
    const conflictError = new Error('WEEKLY_TEMPLATE_START_FROM_BEFORE_LAST_CONFIRMED') as Error & {
      studentId?: string;
      minAllowedDate?: string;
    };
    conflictError.studentId = studentId;
    conflictError.minAllowedDate = '2026-03-20';
    mockedReplaceTeacherWeeklyTemplate.mockRejectedValue(conflictError);

    const response = await PUT(
      new Request('http://localhost/api/v1/journal/weekly-template?teacherId=teacher-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [
            {
              weekday: 1,
              startTime: '10:00',
              startFrom: '2026-03-19',
              studentId,
              isActive: true
            }
          ]
        })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'START_FROM_BEFORE_LAST_CONFIRMED',
      studentId,
      minAllowedDate: '2026-03-20'
    });
  });

  it('saves weekly template with normalized values', async () => {
    mockedReplaceTeacherWeeklyTemplate.mockResolvedValue(undefined);

    const response = await PUT(
      new Request('http://localhost/api/v1/journal/weekly-template?teacherId=teacher-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [
            {
              weekday: 2,
              startTime: '09:00',
              startFrom: '2026-03-25',
              studentId: null,
              isActive: true
            }
          ]
        })
      })
    );

    expect(response.status).toBe(204);
    expect(mockedReplaceTeacherWeeklyTemplate).toHaveBeenCalledWith({
      teacherId: 'teacher-1',
      actorUserId: 'admin-1',
      slots: [
        {
          weekday: 2,
          startTime: '09:00',
          startFrom: '2026-03-25',
          studentId: null,
          isActive: true
        }
      ]
    });
  });
});
