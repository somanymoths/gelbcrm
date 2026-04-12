import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { normalizeIsoDate, resolveJournalScope } from '@/lib/journal';
import { previewJournalVacation, type VacationType } from '@/lib/journal-vacations';

const previewSchema = z.object({
  teacherId: z.string().trim().optional(),
  type: z.enum(['teacher', 'student', 'holidays']),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim(),
  selectedStudentIds: z.array(z.string().uuid()).default([])
});

export async function POST(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const json = await request.json().catch(() => null);
    const parsed = previewSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные для предпросмотра' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const payload = await previewJournalVacation({
      teacherId: scope.teacherId,
      type: parsed.data.type as VacationType,
      dateFrom: normalizeIsoDate(parsed.data.dateFrom),
      dateTo: normalizeIsoDate(parsed.data.dateTo),
      selectedStudentIds: parsed.data.selectedStudentIds
    });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось рассчитать пропущенные занятия' }, { status: 500 });
  }
}
