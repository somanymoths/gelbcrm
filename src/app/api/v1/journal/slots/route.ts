import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { createTeacherLessonSlot, listTeacherLessonSlots } from '@/lib/db';
import { normalizeHmTime, normalizeIsoDate, resolveJournalScope } from '@/lib/journal';

const listSchema = z.object({
  teacherId: z.string().uuid().optional(),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim()
});

const createSchema = z.object({
  teacherId: z.string().uuid().optional(),
  studentId: z.string().uuid().nullable().optional(),
  date: z.string().trim(),
  startTime: z.string().trim()
});

export async function GET(request: Request) {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = listSchema.safeParse({
      teacherId: url.searchParams.get('teacherId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? '',
      dateTo: url.searchParams.get('dateTo') ?? ''
    });
    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
    }

    const scope = await resolveJournalScope(guard.session, parsed.data.teacherId);
    const dateFrom = normalizeIsoDate(parsed.data.dateFrom);
    const dateTo = normalizeIsoDate(parsed.data.dateTo);

    const slots = await listTeacherLessonSlots({
      teacherId: scope.teacherId,
      dateFrom,
      dateTo
    });

    return NextResponse.json(slots);
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

    const created = await createTeacherLessonSlot({
      teacherId: scope.teacherId,
      actorUserId: guard.session.id,
      studentId: parsed.data.studentId ?? null,
      date: normalizeIsoDate(parsed.data.date),
      startTime: normalizeHmTime(parsed.data.startTime)
    });

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
