import { invalidateRequestCache } from '@/lib/request-cache';

export const JournalCacheKeys = {
  bootstrap: (input: {
    role: 'admin' | 'teacher';
    userId: string;
    teacherId: string;
    dateFrom: string;
    dateTo: string;
  }) => `journal:bootstrap:${input.role}:${input.userId}:${input.teacherId}:${input.dateFrom}:${input.dateTo}`
} as const;

export function invalidateJournalTeacherCache(teacherId: string): void {
  void teacherId;
  invalidateRequestCache(`journal:bootstrap:admin:`);
  invalidateRequestCache(`journal:bootstrap:teacher:`);
}
