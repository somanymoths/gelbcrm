import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { listTeacherPlannedSlotCountsBeforeDate } from '@/lib/db';
import { normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const querySchema = z.object({
  teacherId: z.string().trim().optional(),
  dateFrom: z.string().trim()
});

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? ''
    });

    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const dateFrom = normalizeIsoDate(parsed.data.dateFrom);

    const items = await listTeacherPlannedSlotCountsBeforeDate({
      teacherId: scope.teacherId,
      date: dateFrom
    });

    return NextResponse.json(items);
  } catch (error) {
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

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось рассчитать базу прогноза' }, { status: 500 });
  }
}
