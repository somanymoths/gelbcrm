import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { createTeacherAccess, getTeacherAccessStatus, getTeacherById } from '@/lib/db';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    const status = await getTeacherAccessStatus({ teacherId: id });
    if (!status) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    return NextResponse.json({
      teacherId: status.teacher_id,
      hasAccess: Boolean(status.user_id),
      login: status.login,
      lastLoginAt: status.last_login_at
    });
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить доступ преподавателя' }, { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    const teacher = await getTeacherById({ id });
    if (!teacher) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    const login = teacher.email?.trim().toLowerCase() ?? '';
    if (!login) {
      return NextResponse.json(
        { code: 'TEACHER_EMAIL_REQUIRED', message: 'Для создания доступа заполните email преподавателя' },
        { status: 422 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hash(temporaryPassword, 12);

    const created = await createTeacherAccess({
      teacherId: id,
      actorUserId: guard.session.id,
      login,
      passwordHash
    });

    return NextResponse.json(
      {
        teacherId: created.teacher_id,
        login: created.login,
        temporaryPassword
      },
      { status: 201 }
    );
  } catch (error) {
    if (isKnownError(error, 'TEACHER_NOT_FOUND')) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    if (isKnownError(error, 'TEACHER_ACCESS_ALREADY_EXISTS')) {
      return NextResponse.json(
        { code: 'TEACHER_ACCESS_ALREADY_EXISTS', message: 'Доступ для преподавателя уже создан' },
        { status: 409 }
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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать доступ преподавателя' }, { status: 500 });
  }
}

function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let result = '';
  for (const byte of bytes) {
    result += alphabet[byte % alphabet.length];
  }
  return result;
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function isDuplicateError(error: unknown, fieldName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(fieldName));
}
