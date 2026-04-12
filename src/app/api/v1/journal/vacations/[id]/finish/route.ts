import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateJournalTeacherCache } from '@/lib/journal-cache';
import { finishVacationEarly, previewVacationRollbackCount } from '@/lib/journal-vacations';
import { normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const bodySchema = z.object({
  teacherId: z.string().trim().optional(),
  earlyFinishDate: z.string().trim(),
  previewOnly: z.boolean().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const params = await context.params;
    const vacationId = params.id;
    if (!vacationId) {
      return NextResponse.json({ code: 'INVALID_ID', message: 'Не указан отпуск' }, { status: 400 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные параметры' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const earlyFinishDate = normalizeIsoDate(parsed.data.earlyFinishDate);

    if (parsed.data.previewOnly) {
      const rollbackCount = await previewVacationRollbackCount({
        vacationId,
        teacherId: scope.teacherId,
        mode: 'early_finish',
        earlyFinishDate
      });
      return NextResponse.json({ rollbackCount });
    }

    const result = await finishVacationEarly({
      vacationId,
      teacherId: scope.teacherId,
      actorUserId: guard.session.id,
      earlyFinishDate
    });

    invalidateJournalTeacherCache(scope.teacherId);

    return NextResponse.json(result);
  } catch (error) {
    return mapVacationActionError(error, 'Не удалось завершить отпуск досрочно');
  }
}

function mapVacationActionError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : '';

  if (message === 'TEACHER_ID_REQUIRED') {
    return NextResponse.json({ code: 'TEACHER_ID_REQUIRED', message: 'Укажите преподавателя' }, { status: 400 });
  }
  if (message === 'TEACHER_PROFILE_NOT_FOUND') {
    return NextResponse.json({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Профиль преподавателя не найден' }, { status: 404 });
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 });
  }
  if (message === 'INVALID_DATE') {
    return NextResponse.json({ code: 'INVALID_DATE', message: 'Некорректная дата' }, { status: 400 });
  }
  if (message === 'VACATION_NOT_FOUND') {
    return NextResponse.json({ code: 'VACATION_NOT_FOUND', message: 'Отпуск не найден' }, { status: 404 });
  }
  if (message === 'VACATION_ALREADY_CANCELED') {
    return NextResponse.json({ code: 'VACATION_ALREADY_CANCELED', message: 'Отпуск уже отменён' }, { status: 409 });
  }
  if (message === 'VACATION_EARLY_FINISH_ALLOWED_ONLY_ACTIVE') {
    return NextResponse.json(
      { code: 'VACATION_EARLY_FINISH_ALLOWED_ONLY_ACTIVE', message: 'Досрочное завершение доступно только для активного отпуска' },
      { status: 409 }
    );
  }
  if (message === 'VACATION_EARLY_FINISH_DATE_OUT_OF_RANGE') {
    return NextResponse.json(
      { code: 'VACATION_EARLY_FINISH_DATE_OUT_OF_RANGE', message: 'Дата досрочного завершения вне допустимого диапазона' },
      { status: 422 }
    );
  }

  const infraError = mapInfraError(error, {
    misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
    dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
    dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
  });
  if (infraError) return infraError;

  console.error(error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', message: fallbackMessage }, { status: 500 });
}
