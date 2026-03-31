import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { listJournalAuditEvents } from '@/lib/db';

const querySchema = z.object({
  teacherId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursorCreatedAt: z.string().trim().optional(),
  cursorId: z.coerce.number().int().positive().optional()
});

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    teacherId: url.searchParams.get('teacherId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursorCreatedAt: url.searchParams.get('cursorCreatedAt') ?? undefined,
    cursorId: url.searchParams.get('cursorId') ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
  }

  const hasCursor = Boolean(parsed.data.cursorCreatedAt || parsed.data.cursorId);
  if (hasCursor && (!parsed.data.cursorCreatedAt || typeof parsed.data.cursorId !== 'number')) {
    return NextResponse.json({ code: 'INVALID_CURSOR', message: 'Некорректный курсор' }, { status: 400 });
  }

  try {
    const items = await listJournalAuditEvents({
      teacherId: parsed.data.teacherId,
      limit: parsed.data.limit,
      cursorCreatedAt: parsed.data.cursorCreatedAt,
      cursorId: parsed.data.cursorId
    });

    const nextCursor = items.length > 0 ? items[items.length - 1] : null;

    return NextResponse.json({
      items,
      nextCursor: nextCursor
        ? {
            createdAt: nextCursor.created_at,
            id: nextCursor.id
          }
        : null
    });
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить аудит журнала' }, { status: 500 });
  }
}
