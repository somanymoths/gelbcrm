import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { deleteTeacherPermanently, getTeacherById, updateTeacher } from '@/lib/db';
import { normalizeTeacherPhone, normalizeTelegramRaw } from '@/lib/teachers';

const updateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  languageId: z.number().int().positive().nullable().optional(),
  rateRub: z.number().int().min(0).nullable().optional(),
  telegramRaw: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(191).nullable().optional(),
  comment: z.string().trim().max(1000).nullable().optional()
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const item = await getTeacherById({ id });
  if (!item) {
    return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные преподавателя' }, { status: 400 });
  }

  let phone: string | null = null;

  try {
    phone = normalizeTeacherPhone(parsed.data.phone ?? null);
  } catch {
    return NextResponse.json({ code: 'INVALID_PHONE_FORMAT', message: 'Некорректный формат телефона' }, { status: 422 });
  }

  try {
    const updated = await updateTeacher({
      id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      languageId: parsed.data.languageId ?? null,
      rateRub: parsed.data.rateRub ?? null,
      telegramRaw: normalizeTelegramRaw(parsed.data.telegramRaw ?? null),
      phone,
      email: parsed.data.email?.trim().toLowerCase() ?? null,
      comment: parsed.data.comment ?? null,
      actorUserId: guard.session.id
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (isKnownError(error, 'TEACHER_NOT_FOUND')) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    if (isDuplicateError(error, 'uq_teachers_phone')) {
      return NextResponse.json({ code: 'DUPLICATE_PHONE', message: 'Преподаватель с таким телефоном уже существует' }, { status: 409 });
    }

    if (isDuplicateError(error, 'uq_teachers_telegram_normalized')) {
      return NextResponse.json(
        { code: 'DUPLICATE_TELEGRAM', message: 'Преподаватель с таким Telegram уже существует' },
        { status: 409 }
      );
    }
    if (isDuplicateError(error, 'uq_teachers_email')) {
      return NextResponse.json({ code: 'DUPLICATE_EMAIL', message: 'Преподаватель с таким email уже существует' }, { status: 409 });
    }
    if (isKnownError(error, 'TEACHER_EMAIL_REQUIRED_FOR_ACCESS')) {
      return NextResponse.json(
        { code: 'TEACHER_EMAIL_REQUIRED_FOR_ACCESS', message: 'Нельзя очистить email у преподавателя с активным доступом' },
        { status: 422 }
      );
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить преподавателя' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await deleteTeacherPermanently({ id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownError(error, 'TEACHER_NOT_FOUND')) {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    if (isKnownError(error, 'TEACHER_HAS_DEPENDENCIES')) {
      return NextResponse.json(
        { code: 'TEACHER_HAS_DEPENDENCIES', message: 'Нельзя удалить преподавателя: есть привязанные ученики' },
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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось удалить преподавателя' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function isDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}
