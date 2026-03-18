import type { SessionUser } from '@/lib/session';
import { findTeacherByUserId } from '@/lib/db';

export type JournalScope = {
  teacherId: string;
  mode: 'admin' | 'teacher';
};

export async function resolveJournalScope(session: SessionUser, requestedTeacherId?: string | null): Promise<JournalScope> {
  if (session.role === 'admin') {
    if (!requestedTeacherId) {
      throw new Error('TEACHER_ID_REQUIRED');
    }
    return { teacherId: requestedTeacherId, mode: 'admin' };
  }

  const teacher = await findTeacherByUserId(session.id);
  if (!teacher) {
    throw new Error('TEACHER_PROFILE_NOT_FOUND');
  }

  if (requestedTeacherId && requestedTeacherId !== teacher.id) {
    throw new Error('FORBIDDEN');
  }

  return { teacherId: teacher.id, mode: 'teacher' };
}

export function normalizeIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('INVALID_DATE');
  }
  const [year, month, day] = value.split('-').map((item) => Number(item));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('INVALID_DATE');
  }
  return value;
}

export function normalizeHmTime(value: string): string {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error('INVALID_TIME');
  }
  const [hours, minutes] = value.split(':').map((item) => Number(item));
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('INVALID_TIME');
  }
  return value;
}
