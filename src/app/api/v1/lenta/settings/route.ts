import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { getLentaSettings, updateLentaSettings } from '@/lib/lenta';

const payloadSchema = z.object({
  acquiringPercent: z.number().min(0).max(100),
  taxPercent: z.number().min(0).max(100),
  fundDevelopmentPercent: z.number().min(0).max(100),
  fundSafetyPercent: z.number().min(0).max(100),
  fundDividendsPercent: z.number().min(0).max(100)
});

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const settings = await getLentaSettings();
    return NextResponse.json(settings);
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить настройки ленты' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const json = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные настройки ленты' }, { status: 400 });
    }

    const updated = await updateLentaSettings(parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'INVALID_PERCENT') {
      return NextResponse.json({ code: 'INVALID_PERCENT', message: 'Процент должен быть в диапазоне 0..100' }, { status: 400 });
    }

    if (message === 'INVALID_FUNDS_SUM') {
      return NextResponse.json({ code: 'INVALID_FUNDS_SUM', message: 'Сумма фондов должна быть равна 100%' }, { status: 400 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось сохранить настройки ленты' }, { status: 500 });
  }
}
