import { compare } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mapInfraError } from '@/lib/api-error-mappers';
import { findActiveUserByLogin, markUserLastLoginAt } from '@/lib/db';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/env';
import { createSessionToken } from '@/lib/session';

const bodySchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные входа' }, { status: 400 });
    }

    const login = parsed.data.login.trim().normalize('NFKC');
    const password = parsed.data.password;
    const user = await findActiveUserByLogin(login);

    if (!user) {
      return NextResponse.json({ code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' }, { status: 401 });
    }

    const passwordCandidates = buildPasswordCandidates(password);
    let valid = false;
    for (const candidate of passwordCandidates) {
      valid = await compare(candidate, user.password_hash);
      if (valid) break;
    }
    if (!valid) {
      return NextResponse.json({ code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль' }, { status: 401 });
    }

    const token = await createSessionToken({
      id: user.id,
      role: user.role,
      login: user.login,
      sessionVersion: Number(user.session_version ?? 1)
    });

    await markUserLastLoginAt(user.id);

    const response = NextResponse.json({
      id: user.id,
      role: user.role,
      login: user.login
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS
    });

    return response;
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* и SESSION_SECRET в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Ошибка авторизации в БД: проверьте DB_USERNAME/DB_PASSWORD',
      dbUnreachableStatus: 500,
      dbAuthFailedStatus: 500
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка входа' }, { status: 500 });
  }
}

function buildPasswordCandidates(password: string): string[] {
  const candidates = new Set<string>();
  candidates.add(password);

  const normalized = password.normalize('NFKC');
  candidates.add(normalized);
  candidates.add(password.trim());
  candidates.add(normalized.trim());

  return Array.from(candidates).filter((item) => item.length > 0);
}
