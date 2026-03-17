import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { getTariffGridById, updateTariffGrid } from '@/lib/db';

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional()
  })
  .strict();

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const item = await getTariffGridById({ id });

  if (!item) {
    return NextResponse.json({ code: 'TARIFF_GRID_NOT_FOUND', message: 'Тариф не найден' }, { status: 404 });
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
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные тарифа' }, { status: 400 });
  }

  try {
    await updateTariffGrid({
      id,
      actorUserId: guard.session.id,
      name: parsed.data.name
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TARIFF_GRID_NOT_FOUND') {
      return NextResponse.json({ code: 'TARIFF_GRID_NOT_FOUND', message: 'Тариф не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить тариф' }, { status: 500 });
  }
}
