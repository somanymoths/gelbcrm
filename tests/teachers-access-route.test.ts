import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/v1/teachers/[id]/access/route';
import { requireAdmin } from '@/lib/api-auth';
import { createTeacherAccess, getTeacherAccessStatus, getTeacherById } from '@/lib/db';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  createTeacherAccess: vi.fn(),
  getTeacherAccessStatus: vi.fn(),
  getTeacherById: vi.fn()
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hash-value')
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedCreateTeacherAccess = vi.mocked(createTeacherAccess);
const mockedGetTeacherAccessStatus = vi.mocked(getTeacherAccessStatus);
const mockedGetTeacherById = vi.mocked(getTeacherById);

describe('teachers access route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    });
  });

  it('returns access status', async () => {
    mockedGetTeacherAccessStatus.mockResolvedValue({
      teacher_id: 'teacher-1',
      user_id: 'user-1',
      login: 'teacher@example.com',
      last_login_at: '2026-03-30T00:00:00.000Z'
    });

    const response = await GET(new Request('http://localhost/api/v1/teachers/teacher-1/access'), {
      params: Promise.resolve({ id: 'teacher-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      teacherId: 'teacher-1',
      hasAccess: true,
      login: 'teacher@example.com'
    });
  });

  it('creates access with temporary password', async () => {
    mockedGetTeacherById.mockResolvedValue({
      id: 'teacher-1',
      first_name: 'Иван',
      last_name: 'Петров',
      full_name: 'Иван Петров',
      language_id: null,
      language_name: null,
      language_flag_emoji: null,
      rate_rub: null,
      telegram_raw: null,
      telegram_display: null,
      phone: null,
      email: 'teacher@example.com',
      comment: null,
      active_students_count: 0,
      created_at: '2026-03-30 00:00:00',
      updated_at: '2026-03-30 00:00:00',
      deleted_at: null,
      students: []
    });
    mockedCreateTeacherAccess.mockResolvedValue({
      teacher_id: 'teacher-1',
      user_id: 'user-1',
      login: 'teacher@example.com'
    });

    const response = await POST(new Request('http://localhost/api/v1/teachers/teacher-1/access', { method: 'POST' }), {
      params: Promise.resolve({ id: 'teacher-1' })
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { temporaryPassword: string; login: string };
    expect(body.login).toBe('teacher@example.com');
    expect(body.temporaryPassword).toMatch(/^[A-Za-z0-9]+$/);
    expect(body.temporaryPassword.length).toBe(12);
    expect(mockedCreateTeacherAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 'teacher-1',
        actorUserId: 'admin-1',
        login: 'teacher@example.com',
        passwordHash: 'hash-value'
      })
    );
  });
});
