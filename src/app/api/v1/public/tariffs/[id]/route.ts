import { NextResponse } from 'next/server';
import { getTariffGridById } from '@/lib/db';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tariff = await getTariffGridById({ id });

  if (!tariff || !tariff.is_active) {
    return NextResponse.json({ code: 'TARIFF_NOT_FOUND', message: 'Тариф не найден' }, { status: 404 });
  }

  const activePackages = tariff.packages.filter((item) => item.is_active === 1);

  return NextResponse.json({
    id: tariff.id,
    name: tariff.name,
    packages: activePackages.map((item) => ({
      id: item.id,
      lessons_count: item.lessons_count,
      price_per_lesson_rub: item.price_per_lesson_rub,
      total_price_rub: item.total_price_rub
    }))
  });
}
