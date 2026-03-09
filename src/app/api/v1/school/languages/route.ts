import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createSchoolLanguage, listSchoolLanguages } from '@/lib/db';

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  flagEmoji: z.string().trim().max(16).nullable().optional()
});

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listSchoolLanguages();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректное имя языка' }, { status: 400 });
  }

  try {
    const created = await createSchoolLanguage({ name: parsed.data.name, flagEmoji: parsed.data.flagEmoji ?? null });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      const dbError = error as { code?: string };
      if (dbError.code === 'ER_DUP_ENTRY') {
        return NextResponse.json({ code: 'DUPLICATE_LANGUAGE', message: 'Язык уже существует' }, { status: 409 });
      }
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать язык' }, { status: 500 });
  }
}
