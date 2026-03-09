import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createFunnelCard } from '@/lib/funnel';
import { normalizePhone } from '@/lib/phone';

const createSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  contact: z.string().trim().min(1).max(255),
  email: z.string().trim().email(),
  leadSource: z.string().trim().min(1).max(191),
  comment: z.string().trim().min(1),
  startLessonsAt: z.string().trim().optional().nullable(),
  lastLessonAt: z.string().trim().optional().nullable(),
  paidLessonsLeft: z.number().int().min(0)
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные карточки' }, { status: 400 });
  }

  let phone: string;

  try {
    phone = normalizePhone(parsed.data.phone) ?? '';
  } catch {
    return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
  }

  if (!phone) {
    return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
  }

  try {
    const created = await createFunnelCard({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone,
      contact: parsed.data.contact,
      email: parsed.data.email,
      leadSource: parsed.data.leadSource,
      comment: parsed.data.comment,
      startLessonsAt: parsed.data.startLessonsAt ?? null,
      lastLessonAt: parsed.data.lastLessonAt ?? null,
      paidLessonsLeft: parsed.data.paidLessonsLeft,
      actorUserId: guard.session.id
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateError(error, 'uq_students_phone_active')) {
      return NextResponse.json({ code: 'DUPLICATE_PHONE', message: 'Карточка с таким телефоном уже существует' }, { status: 409 });
    }

    if (isDuplicateError(error, 'uq_students_email_active')) {
      return NextResponse.json({ code: 'DUPLICATE_EMAIL', message: 'Карточка с таким email уже существует' }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать карточку' }, { status: 500 });
  }
}

function isDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}
