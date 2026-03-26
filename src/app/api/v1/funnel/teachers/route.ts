import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listActiveTeachersBasic } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const FUNNEL_TEACHERS_TTL_MS = 10_000;

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;

    const items = await withShortTtlCache(FunnelCacheKeys.teachers, FUNNEL_TEACHERS_TTL_MS, listActiveTeachersBasic);
    return NextResponse.json(items);
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить преподавателей' }, { status: 500 });
  }
}
