import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createTariffGrid, listTariffGrids } from '@/lib/db';

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  packages: z
    .array(
      z.object({
        lessonsCount: z.number().int().min(1),
        pricePerLessonRub: z.number().positive()
      })
    )
    .min(1)
});

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get('includeInactive') === '1';

  const items = await listTariffGrids({ includeInactive });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные тарифа' }, { status: 400 });
  }

  try {
    const created = await createTariffGrid({
      name: parsed.data.name,
      packages: parsed.data.packages,
      actorUserId: guard.session.id
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать тариф' }, { status: 500 });
  }
}
