import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateJournalTeacherCache } from '@/lib/journal-cache';
import { normalizeIsoDate, resolveJournalScope } from '@/lib/journal';
import { createJournalVacation, listJournalVacationsHistory, type VacationType } from '@/lib/journal-vacations';

const historySchema = z.object({
  teacherId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const createSchema = z.object({
  teacherId: z.string().trim().optional(),
  type: z.enum(['teacher', 'student', 'holidays']),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim(),
  selectedStudentIds: z.array(z.string().uuid()).default([]),
  comment: z.string().max(500).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = historySchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const payload = await listJournalVacationsHistory({
      teacherId: scope.teacherId,
      limit: parsed.data.limit ?? 20,
      offset: parsed.data.offset ?? 0
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    return mapVacationError(error, 'Не удалось загрузить историю отпусков');
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные отпуска' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);

    const created = await createJournalVacation({
      teacherId: scope.teacherId,
      actorUserId: guard.session.id,
      type: parsed.data.type as VacationType,
      dateFrom: normalizeIsoDate(parsed.data.dateFrom),
      dateTo: normalizeIsoDate(parsed.data.dateTo),
      selectedStudentIds: parsed.data.selectedStudentIds,
      comment: parsed.data.comment
    });

    invalidateJournalTeacherCache(scope.teacherId);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapVacationError(error, 'Не удалось назначить отпуск');
  }
}

function mapVacationError(error: unknown, fallbackMessage: string) {
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
  if (message === 'INVALID_DATE_RANGE') {
    return NextResponse.json({ code: 'INVALID_DATE_RANGE', message: 'Дата окончания не может быть раньше даты начала' }, { status: 422 });
  }
  if (message === 'VACATION_START_TOO_EARLY') {
    return NextResponse.json({ code: 'VACATION_START_TOO_EARLY', message: 'Дата начала отпуска должна быть не раньше завтрашнего дня' }, { status: 422 });
  }
  if (message === 'VACATION_STUDENTS_REQUIRED') {
    return NextResponse.json({ code: 'VACATION_STUDENTS_REQUIRED', message: 'Выберите хотя бы одного ученика' }, { status: 422 });
  }
  if (message === 'VACATION_STUDENT_SINGLE_REQUIRED') {
    return NextResponse.json({ code: 'VACATION_STUDENT_SINGLE_REQUIRED', message: 'Для отпуска ученика нужно выбрать ровно одного ученика' }, { status: 422 });
  }
  if (message === 'VACATION_NO_STUDENTS_FOR_TEACHER') {
    return NextResponse.json({ code: 'VACATION_NO_STUDENTS_FOR_TEACHER', message: 'У учителя нет учеников для назначения отпуска' }, { status: 422 });
  }
  if (message === 'VACATION_PERIOD_INTERSECTION') {
    return NextResponse.json(
      {
        code: 'VACATION_PERIOD_INTERSECTION',
        message: 'На выбранный период уже есть отпуск для выбранных занятий. Измените период или состав учеников.'
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
