import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { getTeacherWeeklyTemplate, replaceTeacherWeeklyTemplate } from '@/lib/db';
import { getIdempotencyKeyFromRequest, runIdempotent } from '@/lib/idempotency';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const querySchema = z.object({
  teacherId: z.string().trim().optional()
});

const bodySchema = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        startTime: z.string().trim(),
        startFrom: z.string().trim().optional().nullable(),
        studentId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional()
      })
    )
    .max(300)
});

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const slots = await getTeacherWeeklyTemplate(scope.teacherId);
    return NextResponse.json(slots);
  } catch (error) {
    return mapJournalError(error, 'Не удалось загрузить недельный шаблон');
  }
}

export async function PUT(request: Request) {
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

    await runIdempotent(`journal:weekly-template:${scope.teacherId}`, idempotencyKey, async () => {
      await replaceTeacherWeeklyTemplate({
        teacherId: scope.teacherId,
        actorUserId: guard.session.id,
        slots: parsedBody.data.slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: normalizeHmTime(slot.startTime),
          startFrom: slot.startFrom ? normalizeIsoDate(slot.startFrom) : null,
          studentId: slot.studentId ?? null,
          isActive: slot.isActive ?? true
        }))
      });
      return true;
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapJournalError(error, 'Не удалось сохранить недельный шаблон');
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

  console.error(error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', message: fallbackMessage }, { status: 500 });
}
