import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { createTeacher, listTeachers, type TeacherSortBy } from '@/lib/db';
import { normalizeTeacherPhone, normalizeTelegramRaw } from '@/lib/teachers';

const listSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().optional(),
  languageId: z.coerce.number().int().positive().optional(),
  scope: z.enum(['active', 'archived']).default('active'),
  sortBy: z.enum(['name', 'students', 'rate', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional()
});

const createSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  languageId: z.number().int().positive().nullable().optional(),
  rateRub: z.number().int().min(0).nullable().optional(),
  telegramRaw: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  comment: z.string().trim().max(1000).nullable().optional()
});

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    offset: url.searchParams.get('offset') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    languageId: url.searchParams.get('languageId') ?? undefined,
    scope: url.searchParams.get('scope') ?? undefined,
    sortBy: url.searchParams.get('sortBy') ?? undefined,
    sortDir: url.searchParams.get('sortDir') ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_QUERY', message: 'Некорректные параметры запроса' }, { status: 400 });
  }

  const data = await listTeachers({
    offset: parsed.data.offset,
    limit: parsed.data.limit,
    scope: parsed.data.scope,
    search: parsed.data.search ?? null,
    languageId: parsed.data.languageId ?? null,
    sortBy: (parsed.data.sortBy as TeacherSortBy | undefined) ?? 'createdAt',
    sortDir: parsed.data.sortDir ?? 'desc'
  });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

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
    const created = await createTeacher({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      languageId: parsed.data.languageId ?? null,
      rateRub: parsed.data.rateRub ?? null,
      telegramRaw: normalizeTelegramRaw(parsed.data.telegramRaw ?? null),
      phone,
      comment: parsed.data.comment ?? null,
      actorUserId: guard.session.id
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateError(error, 'uq_teachers_phone')) {
      return NextResponse.json({ code: 'DUPLICATE_PHONE', message: 'Преподаватель с таким телефоном уже существует' }, { status: 409 });
    }

    if (isDuplicateError(error, 'uq_teachers_telegram_normalized')) {
      return NextResponse.json(
        { code: 'DUPLICATE_TELEGRAM', message: 'Преподаватель с таким Telegram уже существует' },
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
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать преподавателя' }, { status: 500 });
  }
}

function isDuplicateError(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'ER_DUP_ENTRY' && Boolean(candidate.message?.includes(indexName));
}
