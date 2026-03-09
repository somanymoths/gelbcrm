import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createTariffPackage } from '@/lib/db';

const createSchema = z.object({
  lessonsCount: z.number().int().min(1),
  pricePerLessonRub: z.number().positive()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные пакета' }, { status: 400 });
  }

  try {
    const created = await createTariffPackage({
      tariffGridId: id,
      lessonsCount: parsed.data.lessonsCount,
      pricePerLessonRub: parsed.data.pricePerLessonRub
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TARIFF_GRID_NOT_FOUND') {
      return NextResponse.json({ code: 'TARIFF_GRID_NOT_FOUND', message: 'Тариф не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось добавить пакет' }, { status: 500 });
  }
}
