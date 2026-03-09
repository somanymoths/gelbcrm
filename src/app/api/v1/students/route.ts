import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createStudent, listStudents } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

const createSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  contactLink: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable()
});

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listStudents();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные ученика' }, { status: 400 });
  }

  const payload = parsed.data;

  let phone: string | null = null;

  try {
    phone = normalizePhone(payload.phone);
  } catch {
    return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
  }

  try {
    const created = await createStudent({
      firstName: payload.firstName,
      lastName: payload.lastName,
      contactLink: payload.contactLink ?? null,
      phone,
      email: payload.email ?? null,
      actorUserId: guard.session.id
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateError(error, 'uq_students_email') || isDuplicateError(error, 'uq_students_email_active')) {
      return NextResponse.json({ code: 'DUPLICATE_EMAIL', message: 'Ученик с таким email уже существует' }, { status: 409 });
    }

    if (isDuplicateError(error, 'uq_students_phone') || isDuplicateError(error, 'uq_students_phone_active')) {
      return NextResponse.json({ code: 'DUPLICATE_PHONE', message: 'Ученик с таким телефоном уже существует' }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать ученика' }, { status: 500 });
  }
}

function isDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}
