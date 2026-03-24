import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { invalidateFunnelBoardRelatedCache } from '@/lib/funnel-cache';
import { createFunnelCard } from '@/lib/funnel';
import { normalizePhone } from '@/lib/phone';

const createSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional().nullable(),
  contact: z.string().trim().max(255).optional().nullable(),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  leadSource: z.string().trim().max(191).optional().nullable(),
  comment: z.string().trim().optional().nullable(),
  startLessonsAt: z.string().trim().optional().nullable()
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные карточки' }, { status: 400 });
  }

  const phoneRaw = toNullableTrimmed(parsed.data.phone);
  const contact = toNullableTrimmed(parsed.data.contact);
  const leadSource = toNullableTrimmed(parsed.data.leadSource);
  const comment = toNullableTrimmed(parsed.data.comment);
  const email = toNullableTrimmed(parsed.data.email ?? null);
  const startLessonsAt = toNullableTrimmed(parsed.data.startLessonsAt);
  let phone: string | null = null;

  if (phoneRaw) {
    try {
      phone = normalizePhone(phoneRaw) ?? '';
    } catch {
      return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
    }

    if (!phone) {
      return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
    }
  }

  try {
    const created = await createFunnelCard({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone,
      contact,
      email,
      leadSource,
      comment,
      startLessonsAt,
      actorUserId: guard.session.id
    });
    invalidateFunnelBoardRelatedCache();

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

function toNullableTrimmed(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
