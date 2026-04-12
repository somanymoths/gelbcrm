import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { invalidateJournalTeacherCache } from '@/lib/journal-cache';
import { createTeacherLessonSlot, getTeacherRateRub, listTeacherLessonSlots, listTeacherPlannedSlotCountsBeforeDate } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';
import { calculateJournalWeeklyKpi } from '@/lib/journal-weekly-kpi';
import { getVacationOverlayBySlotIds, listVacationPlannedCountsBeforeDate } from '@/lib/journal-vacations';

const listSchema = z.object({
  teacherId: z.string().trim().optional(),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim(),
  includeBaseline: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === '1' || value === 'true')
});

const createSchema = z.object({
  teacherId: z.string().trim().optional(),
  studentId: z.string().uuid().nullable().optional(),
  date: z.string().trim(),
  startTime: z.string().trim(),
  repeatWeekly: z.boolean().optional()
});

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = listSchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? '',
      dateTo: url.searchParams.get('dateTo') ?? '',
      includeBaseline: url.searchParams.get('includeBaseline') ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const dateFrom = normalizeIsoDate(parsed.data.dateFrom);
    const dateTo = normalizeIsoDate(parsed.data.dateTo);

    const slotsRaw = await listTeacherLessonSlots({
      teacherId: scope.teacherId,
      dateFrom,
      dateTo
    });
    const overlayBySlotId = await getVacationOverlayBySlotIds({
      teacherId: scope.teacherId,
      slotIds: slotsRaw.map((slot) => slot.id)
    });
    const slots = slotsRaw.map((slot) => {
      const vacationStatus = overlayBySlotId.get(slot.id);
      if (!vacationStatus) return slot;
      return { ...slot, status: vacationStatus };
    });

    if (!parsed.data.includeBaseline) {
      return NextResponse.json(slots, {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    const [baselineRaw, vacationBaselineRaw] = await Promise.all([
      listTeacherPlannedSlotCountsBeforeDate({
        teacherId: scope.teacherId,
        date: dateFrom
      }),
      listVacationPlannedCountsBeforeDate({
        teacherId: scope.teacherId,
        date: dateFrom
      })
    ]);
    const vacationBaselineByStudentId = new Map(
      vacationBaselineRaw.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))])
    );
    const baseline = baselineRaw.map((item) => {
      const vacationCount = vacationBaselineByStudentId.get(item.student_id) ?? 0;
      return {
        student_id: item.student_id,
        planned_count: Math.max(0, Number(item.planned_count ?? 0) - vacationCount)
      };
    });

    const rateRub = await getTeacherRateRub({ teacherId: scope.teacherId });
    const weeklyKpi = calculateJournalWeeklyKpi({ slots, rateRub });

    return NextResponse.json({ slots, baseline, weeklyKpi }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    return mapJournalError(error, 'Не удалось загрузить слоты');
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные слота' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const idempotencyKey = getIdempotencyKeyFromRequest(request);

    const created = await runIdempotent(`journal:slots:create:${scope.teacherId}`, idempotencyKey, () =>
      createTeacherLessonSlot({
        teacherId: scope.teacherId,
        actorUserId: guard.session.id,
        studentId: parsed.data.studentId,
        date: normalizeIsoDate(parsed.data.date),
        startTime: normalizeHmTime(parsed.data.startTime),
        repeatWeekly: parsed.data.repeatWeekly ?? false
      })
    );

    invalidateFunnelBoardRelatedCache();
    invalidateJournalTeacherCache(scope.teacherId);
    if (created.student_id) {
      invalidateFunnelCardCache(created.student_id);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return mapJournalError(error, 'Не удалось создать слот');
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
  if (message === 'STUDENT_NOT_ASSIGNED_TO_TEACHER') {
    return NextResponse.json({ code: 'STUDENT_NOT_ASSIGNED_TO_TEACHER', message: 'Ученик не закреплён за преподавателем' }, { status: 422 });
  }
  if (message === 'SLOT_ALREADY_EXISTS') {
    return NextResponse.json({ code: 'SLOT_ALREADY_EXISTS', message: 'Слот с этим временем уже существует' }, { status: 409 });
  }
  if (message === 'STUDENT_TIME_CONFLICT') {
    return NextResponse.json({ code: 'STUDENT_TIME_CONFLICT', message: 'У ученика уже есть занятие в это время' }, { status: 409 });
  }
  if (message === 'WEEKLY_TEMPLATE_SLOT_NOT_FOUND') {
    return NextResponse.json({ code: 'WEEKLY_TEMPLATE_SLOT_NOT_FOUND', message: 'Не найден слот в недельном шаблоне для выбранного времени' }, { status: 422 });
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
