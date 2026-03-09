import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { updateTariffPackage } from '@/lib/db';

const patchSchema = z
  .object({
    lessonsCount: z.number().int().min(1).optional(),
    pricePerLessonRub: z.number().positive().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные пакета' }, { status: 400 });
  }

  try {
    await updateTariffPackage({
      id,
      lessonsCount: parsed.data.lessonsCount,
      pricePerLessonRub: parsed.data.pricePerLessonRub,
      isActive: parsed.data.isActive
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TARIFF_PACKAGE_NOT_FOUND') {
      return NextResponse.json({ code: 'TARIFF_PACKAGE_NOT_FOUND', message: 'Пакет не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить пакет' }, { status: 500 });
  }
}
