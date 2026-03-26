import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { updateTariffPackage } from '@/lib/db';

const patchSchema = z
  .object({
    lessonsCount: z.number().int().min(1).optional(),
    pricePerLessonRub: z.number().positive().optional()
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
      pricePerLessonRub: parsed.data.pricePerLessonRub
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TARIFF_PACKAGE_NOT_FOUND') {
      return NextResponse.json({ code: 'TARIFF_PACKAGE_NOT_FOUND', message: 'Пакет не найден' }, { status: 404 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить пакет' }, { status: 500 });
  }
}
