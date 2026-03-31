import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/v1/journal/audit/route';
import { requireAdmin } from '@/lib/api-auth';
import { listJournalAuditEvents } from '@/lib/db';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  listJournalAuditEvents: vi.fn()
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedListJournalAuditEvents = vi.mocked(listJournalAuditEvents);

describe('journal audit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    });
  });

  it('rejects incomplete cursor', async () => {
    const response = await GET(
      new Request('http://localhost/api/v1/journal/audit?teacherId=teacher-1&cursorCreatedAt=2026-03-30T00:00:00.000Z')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_CURSOR'
    });
  });

  it('returns audit feed with next cursor', async () => {
    mockedListJournalAuditEvents.mockResolvedValue([
      {
        id: 10,
        created_at: '2026-03-30T10:00:00.000Z',
        action_label: 'изменил',
        description: 'статус занятия',
        actor_login: 'admin'
      },
      {
        id: 9,
        created_at: '2026-03-30T09:00:00.000Z',
        action_label: 'создал',
        description: 'занятие',
        actor_login: 'teacher@example.com'
      }
    ]);

    const response = await GET(new Request('http://localhost/api/v1/journal/audit?teacherId=teacher-1&limit=2'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        { id: 10, description: 'статус занятия' },
        { id: 9, description: 'занятие' }
      ],
      nextCursor: {
        createdAt: '2026-03-30T09:00:00.000Z',
        id: 9
      }
    });

    expect(mockedListJournalAuditEvents).toHaveBeenCalledWith({
      teacherId: 'teacher-1',
      limit: 2,
      cursorCreatedAt: undefined,
      cursorId: undefined
    });
  });
});
