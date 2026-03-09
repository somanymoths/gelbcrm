import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { getFunnelCardById, updateFunnelCard } from '@/lib/funnel';
import { normalizePhone } from '@/lib/phone';

const patchSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    contact: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().optional(),
    leadSource: z.string().trim().min(1).max(191).optional(),
    comment: z.string().trim().optional().nullable(),
    startLessonsAt: z.string().trim().optional().nullable(),
    lastLessonAt: z.string().trim().optional().nullable(),
    paidLessonsLeft: z.number().int().min(0).optional()
  })
  .strict();

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const item = await getFunnelCardById({ cardId: id });

  if (!item) {
    return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные карточки' }, { status: 400 });
  }

  let normalizedPhone: string | undefined;

  if (typeof parsed.data.phone === 'string') {
    try {
      normalizedPhone = normalizePhone(parsed.data.phone) ?? undefined;
    } catch {
      return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
    }

    if (!normalizedPhone) {
      return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
    }
  }

  try {
    await updateFunnelCard({
      cardId: id,
      actorUserId: guard.session.id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: normalizedPhone,
      contact: parsed.data.contact,
      email: parsed.data.email,
      leadSource: parsed.data.leadSource,
      comment: parsed.data.comment,
      startLessonsAt: parsed.data.startLessonsAt,
      lastLessonAt: parsed.data.lastLessonAt,
      paidLessonsLeft: parsed.data.paidLessonsLeft
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownError(error, 'STUDENT_NOT_FOUND')) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (isDuplicateError(error, 'uq_students_phone_active')) {
      return NextResponse.json({ code: 'DUPLICATE_PHONE', message: 'Карточка с таким телефоном уже существует' }, { status: 409 });
    }

    if (isDuplicateError(error, 'uq_students_email_active')) {
      return NextResponse.json({ code: 'DUPLICATE_EMAIL', message: 'Карточка с таким email уже существует' }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить карточку' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function isDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}
