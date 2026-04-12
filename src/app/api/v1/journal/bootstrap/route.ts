import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import {
  findTeacherByUserId,
  getTeacherRateRub,
  getTeacherWeeklyTemplate,
  listActiveTeachersForJournal,
  listTeacherLessonSlots,
  listTeacherPlannedSlotCountsBeforeDate,
  listTeacherStudentsForJournal,
  syncTeacherLessonSlotsForRange
} from '@/lib/db';
import { invalidateJournalTeacherCache, JournalCacheKeys } from '@/lib/journal-cache';
import { normalizeIsoDate } from '@/lib/journal';
import { calculateJournalWeeklyKpi } from '@/lib/journal-weekly-kpi';
import { getVacationOverlayBySlotIds, listVacationPlannedCountsBeforeDate } from '@/lib/journal-vacations';
import { withShortTtlCache } from '@/lib/request-cache';

const JOURNAL_BOOTSTRAP_TTL_MS = 3_000;

const querySchema = z.object({
  teacherId: z.string().trim().optional(),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim(),
  syncRange: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === '1' || value === 'true')
});

type TeacherItem = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
};

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? '',
      dateTo: url.searchParams.get('dateTo') ?? '',
      syncRange: url.searchParams.get('syncRange') ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const dateFrom = normalizeIsoDate(parsed.data.dateFrom);
    const dateTo = normalizeIsoDate(parsed.data.dateTo);

    const me = {
      id: guard.session.id,
      role: guard.session.role,
      login: guard.session.login
    };

    let teachers: TeacherItem[] = [];
    let selectedTeacherId: string | null = null;

    if (guard.session.role === 'admin') {
      teachers = await listActiveTeachersForJournal();
      const requestedTeacherId = parsed.data.teacherId;
      selectedTeacherId = requestedTeacherId && teachers.some((item) => item.id === requestedTeacherId)
        ? requestedTeacherId
        : (teachers[0]?.id ?? null);
    } else {
      const teacher = await findTeacherByUserId(guard.session.id);
      if (!teacher) {
        return NextResponse.json({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Профиль преподавателя не найден' }, { status: 404 });
      }
      teachers = [teacher];
      selectedTeacherId = teacher.id;
    }

    if (!selectedTeacherId) {
      return NextResponse.json({
        me,
        teachers,
        selectedTeacherId: null,
        students: [],
        weeklyTemplate: [],
        slotsPayload: {
          slots: [],
          baseline: [],
          weeklyKpi: {
            forecast: { amount: 0, count: 0 },
            fact: { amount: 0, count: 0 },
            cancellations: { amount: 0, count: 0 }
          }
        }
      });
    }

    if (parsed.data.syncRange) {
      await syncTeacherLessonSlotsForRange({ teacherId: selectedTeacherId, dateFrom, dateTo });
      invalidateJournalTeacherCache(selectedTeacherId);
    }

    const cacheKey = JournalCacheKeys.bootstrap({
      role: guard.session.role,
      userId: guard.session.id,
      teacherId: selectedTeacherId,
      dateFrom,
      dateTo
    });

    const loadPayload = async () => {
      const [students, weeklyTemplate, slotsRaw, baselineRaw, vacationBaselineRaw, rateRub] = await Promise.all([
        listTeacherStudentsForJournal(selectedTeacherId),
        getTeacherWeeklyTemplate(selectedTeacherId),
        listTeacherLessonSlots({ teacherId: selectedTeacherId, dateFrom, dateTo }),
        listTeacherPlannedSlotCountsBeforeDate({ teacherId: selectedTeacherId, date: dateFrom }),
        listVacationPlannedCountsBeforeDate({ teacherId: selectedTeacherId, date: dateFrom }),
        getTeacherRateRub({ teacherId: selectedTeacherId })
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
      const overlayBySlotId = await getVacationOverlayBySlotIds({
        teacherId: selectedTeacherId,
        slotIds: slotsRaw.map((slot) => slot.id)
      });
      const slots = slotsRaw.map((slot) => {
        const vacationStatus = overlayBySlotId.get(slot.id);
        if (!vacationStatus) return slot;
        return { ...slot, status: vacationStatus };
      });
      const weeklyKpi = calculateJournalWeeklyKpi({ slots, rateRub });

      return {
        me,
        teachers,
        selectedTeacherId,
        students,
        weeklyTemplate,
        slotsPayload: {
          slots,
          baseline,
          weeklyKpi
        }
      };
    };

    const payload = parsed.data.syncRange
      ? await loadPayload()
      : await withShortTtlCache(cacheKey, JOURNAL_BOOTSTRAP_TTL_MS, loadPayload);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить журнал' }, { status: 500 });
  }
}
