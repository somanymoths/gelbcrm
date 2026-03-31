import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { updateTeacherAccessLogin } from '@/lib/db';

const bodySchema = z.object({
  login: z.string().trim().min(1)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректный логин' }, { status: 400 });
  }

  try {
    const login = parsed.data.login.trim().toLowerCase();
    const updated = await updateTeacherAccessLogin({
      teacherId: id,
      actorUserId: guard.session.id,
      login
    });

    return NextResponse.json({
      teacherId: updated.teacher_id,
      login: updated.login
    });
  } catch (error) {
    if (isKnownError(error, 'TEACHER_NOT_FOUND')) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }
    if (isKnownError(error, 'TEACHER_ACCESS_NOT_FOUND')) {
      return NextResponse.json(
        { code: 'TEACHER_ACCESS_NOT_FOUND', message: 'Для преподавателя еще не создан доступ' },
        { status: 404 }
      );
    }
    if (isDuplicateError(error, 'login')) {
      return NextResponse.json(
        { code: 'DUPLICATE_LOGIN', message: 'Пользователь с таким логином уже существует' },
        { status: 409 }
      );
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось изменить логин' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function isDuplicateError(error: unknown, fieldName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(fieldName));
}
