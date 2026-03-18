import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { updateTeacherLessonSlotStatus, type JournalLessonStatus } from '@/lib/db';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const bodySchema = z.object({
  teacherId: z.string().uuid().optional(),
  status: z.enum(['planned', 'completed', 'rescheduled', 'canceled']),
  rescheduleToDate: z.string().trim().optional(),
  rescheduleToTime: z.string().trim().optional()
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

    await updateTeacherLessonSlotStatus({
      id,
      teacherId: scope.teacherId,
      actorUserId: guard.session.id,
      status: parsed.data.status as JournalLessonStatus,
      rescheduleToDate: parsed.data.rescheduleToDate ? normalizeIsoDate(parsed.data.rescheduleToDate) : undefined,
      rescheduleToTime: parsed.data.rescheduleToTime ? normalizeHmTime(parsed.data.rescheduleToTime) : undefined
    });

    return new NextResponse(null, { status: 204 });
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
  if (message === 'SLOT_STUDENT_REQUIRED') {
    return NextResponse.json({ code: 'SLOT_STUDENT_REQUIRED', message: 'Для подтверждения укажите ученика в слоте' }, { status: 422 });
  }
  if (message === 'RESCHEDULE_TARGET_REQUIRED') {
    return NextResponse.json({ code: 'RESCHEDULE_TARGET_REQUIRED', message: 'Укажите новую дату и время для переноса' }, { status: 422 });
  }
  if (message === 'STUDENT_BALANCE_EMPTY') {
    return NextResponse.json({ code: 'STUDENT_BALANCE_EMPTY', message: 'Недостаточно оплаченных занятий у ученика' }, { status: 422 });
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

  console.error(error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', message: fallbackMessage }, { status: 500 });
}
