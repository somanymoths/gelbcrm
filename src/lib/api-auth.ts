import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';

export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) {
    return { error: NextResponse.json({ code: 'UNAUTHORIZED', message: 'Не авторизован' }, { status: 401 }) };
  }

  if (session.role !== 'admin') {
    return { error: NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 }) };
  }

  return { session };
}
