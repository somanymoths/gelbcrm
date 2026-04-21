import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { listLentaEvents, type LentaStatus } from '@/lib/lenta';
import { normalizeIsoDate } from '@/lib/journal';

const statusSchema = z.enum([
  'planned',
  'overdue',
  'completed',
  'rescheduled',
  'canceled',
  'teacher_vacation',
  'student_vacation',
  'holidays'
]);

const querySchema = z.object({
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  teacherId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  status: statusSchema.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

function getMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = now;

  const dateFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      studentId: url.searchParams.get('studentId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const fallbackRange = getMonthRange();
    const dateFrom = normalizeIsoDate(parsed.data.dateFrom ?? fallbackRange.dateFrom);
    const dateTo = normalizeIsoDate(parsed.data.dateTo ?? fallbackRange.dateTo);

    if (dateFrom > dateTo) {
      return NextResponse.json({ code: 'INVALID_DATE_RANGE', message: 'Некорректный диапазон дат' }, { status: 400 });
    }

    const result = await listLentaEvents({
      dateFrom,
      dateTo,
      teacherId: parsed.data.teacherId,
      studentId: parsed.data.studentId,
      status: parsed.data.status as LentaStatus | undefined,
      offset: parsed.data.offset,
      limit: parsed.data.limit
    });

    return NextResponse.json({
      items: result.items,
      totalCount: result.totalCount,
      nextOffset: result.nextOffset,
      totals: result.totals,
      filters: {
        teachers: result.teachers,
        students: result.students
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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить ленту' }, { status: 500 });
  }
}
