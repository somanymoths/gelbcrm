import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { assignTeacherToFunnelCard } from '@/lib/funnel';

const bodySchema = z.object({
  teacherId: z.string().trim().uuid().nullable()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные преподавателя' }, { status: 400 });
  }

  try {
    await assignTeacherToFunnelCard({
      cardId: id,
      teacherId: parsed.data.teacherId,
      actorUserId: guard.session.id
    });
    invalidateFunnelCardCache(id);
    invalidateFunnelBoardRelatedCache();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownError(error, 'STUDENT_NOT_FOUND')) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (isKnownError(error, 'TEACHER_NOT_FOUND')) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось сохранить преподавателя' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}
