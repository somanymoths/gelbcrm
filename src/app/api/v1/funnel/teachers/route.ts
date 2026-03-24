import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
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
    const message = error instanceof Error ? error.message : '';
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

    if (message.startsWith('Missing required env var:')) {
      return NextResponse.json(
        { code: 'SERVER_MISCONFIGURED', message: 'Сервер не настроен: проверьте DB_* в .env.local' },
        { status: 500 }
      );
    }

    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
      return NextResponse.json(
        { code: 'DB_UNREACHABLE', message: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL' },
        { status: 503 }
      );
    }

    if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
      return NextResponse.json(
        { code: 'DB_AUTH_FAILED', message: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя' },
        { status: 503 }
      );
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить преподавателей' }, { status: 500 });
  }
}
