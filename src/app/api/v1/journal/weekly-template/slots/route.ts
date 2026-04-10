import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { createTeacherWeeklyTemplateSlot } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { invalidateJournalTeacherCache } from '@/lib/journal-cache';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const querySchema = z.object({
  teacherId: z.string().trim().optional()
});

const bodySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().trim(),
  startFrom: z.string().trim().optional().nullable(),
  studentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const json = await request.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(json);
    if (!parsedBody.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные шаблона' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsedQuery.data.teacherId);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);

    const slot = await runIdempotent(`journal:weekly-template:slot:create:${scope.teacherId}`, idempotencyKey, () =>
      createTeacherWeeklyTemplateSlot({
        teacherId: scope.teacherId,
        actorUserId: guard.session.id,
        weekday: parsedBody.data.weekday,
        startTime: normalizeHmTime(parsedBody.data.startTime),
        startFrom: parsedBody.data.startFrom ? normalizeIsoDate(parsedBody.data.startFrom) : null,
        studentId: parsedBody.data.studentId ?? null,
        isActive: parsedBody.data.isActive ?? true
      })
    );
    invalidateJournalTeacherCache(scope.teacherId);

    return NextResponse.json(slot, { status: 201 });
  } catch (error) {
    return mapJournalError(error, 'Не удалось создать слот в шаблоне недели');
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
  if (message === 'TEACHER_NOT_FOUND') {
    return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 });
  }
  if (message === 'INVALID_TIME') {
    return NextResponse.json({ code: 'INVALID_TIME', message: 'Некорректный формат времени' }, { status: 400 });
  }
  if (message === 'INVALID_DATE') {
    return NextResponse.json({ code: 'INVALID_DATE', message: 'Некорректная дата начала занятий' }, { status: 400 });
  }
  if (message === 'STUDENT_NOT_ASSIGNED_TO_TEACHER') {
    return NextResponse.json({ code: 'STUDENT_NOT_ASSIGNED_TO_TEACHER', message: 'Ученик не закреплён за преподавателем' }, { status: 422 });
  }
  if (message === 'SLOT_ALREADY_EXISTS') {
    return NextResponse.json({ code: 'SLOT_ALREADY_EXISTS', message: 'Слот с этим временем уже есть в шаблоне' }, { status: 409 });
  }
  if (message === 'WEEKLY_TEMPLATE_START_FROM_BEFORE_LAST_CONFIRMED') {
    const studentId = typeof (error as { studentId?: unknown })?.studentId === 'string'
      ? (error as { studentId: string }).studentId
      : null;
    const minAllowedDate = typeof (error as { minAllowedDate?: unknown })?.minAllowedDate === 'string'
      ? (error as { minAllowedDate: string }).minAllowedDate
      : null;

    return NextResponse.json(
      {
        code: 'START_FROM_BEFORE_LAST_CONFIRMED',
        message: minAllowedDate
          ? `Дата начала не может быть раньше ${minAllowedDate}: это дата последнего подтвержденного занятия ученика`
          : 'Дата начала не может быть раньше последнего подтвержденного занятия ученика',
        studentId,
        minAllowedDate
      },
      { status: 409 }
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
