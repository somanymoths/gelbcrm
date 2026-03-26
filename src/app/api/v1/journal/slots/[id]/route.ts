import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { deleteTeacherLessonSlot, deleteTeacherWeeklySeriesFromSlot, updateTeacherLessonSlot } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const bodySchema = z.object({
  teacherId: z.string().trim().optional(),
  studentId: z.string().uuid().nullable().optional(),
  date: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  expectedLockVersion: z.number().int().nonnegative().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ code: 'INVALID_SLOT_ID', message: 'Некорректный идентификатор слота' }, { status: 400 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные слота' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);

    const updated = await runIdempotent(`journal:slots:update:${scope.teacherId}:${id}`, idempotencyKey, () =>
      updateTeacherLessonSlot({
        id,
        teacherId: scope.teacherId,
        actorUserId: guard.session.id,
        actorRole: guard.session.role,
        expectedLockVersion: parsed.data.expectedLockVersion,
        studentId: parsed.data.studentId,
        date: parsed.data.date ? normalizeIsoDate(parsed.data.date) : undefined,
        startTime: parsed.data.startTime ? normalizeHmTime(parsed.data.startTime) : undefined
      })
    );

    return NextResponse.json(updated);
  } catch (error) {
    return mapJournalError(error, 'Не удалось обновить слот');
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ code: 'INVALID_SLOT_ID', message: 'Некорректный идентификатор слота' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId') ?? undefined;
    const deleteMode = searchParams.get('deleteMode');
    const expectedLockVersionRaw = searchParams.get('expectedLockVersion');
    const expectedLockVersion =
      expectedLockVersionRaw && /^\d+$/.test(expectedLockVersionRaw) ? Number(expectedLockVersionRaw) : undefined;
    const scope = await resolveJournalScope(guard.session, teacherId);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);

    await runIdempotent(`journal:slots:delete:${scope.teacherId}:${id}:${deleteMode ?? 'single'}`, idempotencyKey, async () => {
      if (deleteMode === 'series') {
        await deleteTeacherWeeklySeriesFromSlot({
          id,
          teacherId: scope.teacherId,
          actorUserId: guard.session.id,
          actorRole: guard.session.role,
          expectedLockVersion
        });
      } else {
        await deleteTeacherLessonSlot({
          id,
          teacherId: scope.teacherId,
          actorUserId: guard.session.id,
          actorRole: guard.session.role,
          expectedLockVersion
        });
      }
      return true;
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapJournalError(error, 'Не удалось удалить слот');
  }
}

function mapJournalError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : '';

  if (message === 'TEACHER_ID_REQUIRED') {
    return NextResponse.json({ code: 'TEACHER_ID_REQUIRED', message: 'Укажите преподавателя' }, { status: 400 });
  }
  if (message === 'TEACHER_PROFILE_NOT_FOUND') {
    return NextResponse.json({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Профиль преподавателя не найден' }, { status: 404 });
  }
  if (message === 'SLOT_NOT_FOUND') {
    return NextResponse.json({ code: 'SLOT_NOT_FOUND', message: 'Слот не найден' }, { status: 404 });
  }
  if (message === 'SLOT_CONFLICT_ADMIN_WON') {
    return NextResponse.json(
      { code: 'SLOT_CONFLICT_ADMIN_WON', message: 'Занятие уже изменено администратором. Обновите журнал.' },
      { status: 409 }
    );
  }
  if (message === 'SLOT_DELETE_ONLY_PLANNED') {
    return NextResponse.json(
      { code: 'SLOT_DELETE_ONLY_PLANNED', message: 'Удалять можно только запланированные занятия или новое перенесённое занятие' },
      { status: 422 }
    );
  }
  if (message === 'SLOT_RESCHEDULE_SOURCE_DELETE_FORBIDDEN') {
    return NextResponse.json(
      { code: 'SLOT_RESCHEDULE_SOURCE_DELETE_FORBIDDEN', message: 'Сначала удалите новое перенесённое занятие' },
      { status: 422 }
    );
  }
  if (message === 'SLOT_EDIT_COMPLETED_FORBIDDEN') {
    return NextResponse.json({ code: 'SLOT_EDIT_COMPLETED_FORBIDDEN', message: 'Завершенное занятие нельзя редактировать' }, { status: 422 });
  }
  if (message === 'SLOT_DELETE_COMPLETED') {
    return NextResponse.json({ code: 'SLOT_DELETE_COMPLETED', message: 'Завершенные занятия удалить нельзя' }, { status: 422 });
  }
  if (message === 'WEEKLY_SLOT_REQUIRED') {
    return NextResponse.json({ code: 'WEEKLY_SLOT_REQUIRED', message: 'Это не еженедельный слот' }, { status: 422 });
  }
  if (message === 'SLOT_ALREADY_EXISTS') {
    return NextResponse.json({ code: 'SLOT_ALREADY_EXISTS', message: 'Слот с этим временем уже существует' }, { status: 409 });
  }
  if (message === 'STUDENT_TIME_CONFLICT') {
    return NextResponse.json({ code: 'STUDENT_TIME_CONFLICT', message: 'У ученика уже есть занятие в это время' }, { status: 409 });
  }
  if (message === 'STUDENT_NOT_ASSIGNED_TO_TEACHER') {
    return NextResponse.json({ code: 'STUDENT_NOT_ASSIGNED_TO_TEACHER', message: 'Ученик не закреплён за преподавателем' }, { status: 422 });
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 });
  }
  if (message === 'INVALID_DATE') {
    return NextResponse.json({ code: 'INVALID_DATE', message: 'Некорректная дата' }, { status: 400 });
  }
  if (message === 'INVALID_TIME') {
    return NextResponse.json({ code: 'INVALID_TIME', message: 'Некорректное время' }, { status: 400 });
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
