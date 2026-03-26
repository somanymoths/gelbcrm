import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { getTeacherLessonSlotStudentId, updateTeacherLessonSlotStatus, type JournalLessonStatus } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const bodySchema = z.object({
  teacherId: z.string().trim().optional(),
  status: z.enum(['planned', 'completed', 'rescheduled', 'canceled']),
  studentId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
  rescheduleToDate: z.string().trim().optional(),
  rescheduleToTime: z.string().trim().optional(),
  expectedLockVersion: z.number().int().nonnegative().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные статуса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);
    const previousStudentId = await getTeacherLessonSlotStudentId({ id, teacherId: scope.teacherId });

    const updated = await runIdempotent(`journal:slots:status:${scope.teacherId}:${id}`, idempotencyKey, () =>
      updateTeacherLessonSlotStatus({
        id,
        teacherId: scope.teacherId,
        actorUserId: guard.session.id,
        actorRole: guard.session.role,
        expectedLockVersion: parsed.data.expectedLockVersion,
        status: parsed.data.status as JournalLessonStatus,
        studentId: parsed.data.studentId,
        reason: parsed.data.reason,
        rescheduleToDate: parsed.data.rescheduleToDate ? normalizeIsoDate(parsed.data.rescheduleToDate) : undefined,
        rescheduleToTime: parsed.data.rescheduleToTime ? normalizeHmTime(parsed.data.rescheduleToTime) : undefined
      })
    );

    invalidateFunnelBoardRelatedCache();
    const affectedStudentIds = new Set<string>();
    if (previousStudentId) affectedStudentIds.add(previousStudentId);
    if (updated.student_id) affectedStudentIds.add(updated.student_id);
    if (parsed.data.studentId) affectedStudentIds.add(parsed.data.studentId);
    for (const studentId of affectedStudentIds) {
      invalidateFunnelCardCache(studentId);
    }

    return NextResponse.json(updated);
  } catch (error) {
    return mapJournalError(error, 'Не удалось изменить статус слота');
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
  if (message === 'SLOT_STUDENT_REQUIRED') {
    return NextResponse.json({ code: 'SLOT_STUDENT_REQUIRED', message: 'Для подтверждения укажите ученика в слоте' }, { status: 422 });
  }
  if (message === 'RESCHEDULE_TARGET_REQUIRED') {
    return NextResponse.json({ code: 'RESCHEDULE_TARGET_REQUIRED', message: 'Укажите новую дату и время для переноса' }, { status: 422 });
  }
  if (message === 'STATUS_REASON_REQUIRED') {
    return NextResponse.json({ code: 'STATUS_REASON_REQUIRED', message: 'Укажите причину изменения статуса' }, { status: 422 });
  }
  if (message === 'SLOT_COMPLETED_STATUS_CHANGE_FORBIDDEN') {
    return NextResponse.json(
      { code: 'SLOT_COMPLETED_STATUS_CHANGE_FORBIDDEN', message: 'Завершенное занятие нельзя перенести или отменить' },
      { status: 422 }
    );
  }
  if (message === 'SLOT_OVERDUE_TO_PLANNED_FORBIDDEN') {
    return NextResponse.json(
      { code: 'SLOT_OVERDUE_TO_PLANNED_FORBIDDEN', message: 'Просроченное занятие нельзя вернуть в Запланировано' },
      { status: 422 }
    );
  }
  if (message === 'SLOT_CANCELED_RESCHEDULE_FORBIDDEN') {
    return NextResponse.json(
      { code: 'SLOT_CANCELED_RESCHEDULE_FORBIDDEN', message: 'Сначала верните занятие в Запланировано, затем переносите' },
      { status: 422 }
    );
  }
  if (message === 'SLOT_COMPLETED_FUTURE_DATE_FORBIDDEN') {
    return NextResponse.json(
      { code: 'SLOT_COMPLETED_FUTURE_DATE_FORBIDDEN', message: 'Нельзя завершить занятие будущего дня' },
      { status: 422 }
    );
  }
  if (message === 'STUDENT_BALANCE_EMPTY') {
    return NextResponse.json({ code: 'STUDENT_BALANCE_EMPTY', message: 'Недостаточно оплаченных занятий у ученика' }, { status: 422 });
  }
  if (message === 'STUDENT_TIME_CONFLICT') {
    return NextResponse.json({ code: 'STUDENT_TIME_CONFLICT', message: 'У ученика уже есть занятие в это время' }, { status: 409 });
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
