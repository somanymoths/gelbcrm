import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { findUserById } from '@/lib/db';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Не авторизован' }, { status: 401 });
  }

  const user = await findUserById(session.id);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Не авторизован' }, { status: 401 });
  }

  return NextResponse.json(user);
}
