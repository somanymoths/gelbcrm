import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { syncTeacherLessonSlotsForRange } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const bodySchema = z.object({
  teacherId: z.string().trim().optional(),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim()
});

export async function POST(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные параметры синхронизации' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const dateFrom = normalizeIsoDate(parsed.data.dateFrom);
    const dateTo = normalizeIsoDate(parsed.data.dateTo);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);

    await runIdempotent(`journal:slots:sync:${scope.teacherId}:${dateFrom}:${dateTo}`, idempotencyKey, async () => {
      await syncTeacherLessonSlotsForRange({
        teacherId: scope.teacherId,
        dateFrom,
        dateTo
      });
      return true;
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'TEACHER_ID_REQUIRED') {
      return NextResponse.json({ code: 'TEACHER_ID_REQUIRED', message: 'Укажите преподавателя' }, { status: 400 });
    }
    if (message === 'TEACHER_PROFILE_NOT_FOUND') {
      return NextResponse.json({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Профиль преподавателя не найден' }, { status: 404 });
    }
    if (message === 'TEACHER_NOT_FOUND') {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 });
    }
    if (message === 'INVALID_DATE') {
      return NextResponse.json({ code: 'INVALID_DATE', message: 'Некорректная дата' }, { status: 400 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось синхронизировать журнал' }, { status: 500 });
  }
}
