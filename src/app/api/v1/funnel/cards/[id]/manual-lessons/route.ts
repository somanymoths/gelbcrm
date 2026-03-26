import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { addFunnelCardManualLessons } from '@/lib/funnel';

const manualLessonsSchema = z
  .object({
    lessonsToAdd: z.number().int().min(1),
    comment: z.string().trim().min(1).max(1000)
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = manualLessonsSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные для добавления занятий' }, { status: 400 });
  }

  try {
    const paidLessonsLeft = await addFunnelCardManualLessons({
      cardId: id,
      lessonsToAdd: parsed.data.lessonsToAdd,
      comment: parsed.data.comment,
      actorUserId: guard.session.id
    });
    invalidateFunnelCardCache(id);
    invalidateFunnelBoardRelatedCache();

    return NextResponse.json({ paidLessonsLeft });
  } catch (error) {
    if (isKnownError(error, 'STUDENT_NOT_FOUND')) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось добавить занятия' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}
