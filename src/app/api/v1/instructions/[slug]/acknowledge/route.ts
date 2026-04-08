import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { findTeacherIdByUserId, setInstructionAcknowledgementBySlug } from '@/lib/instructions-db';

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;

  if (guard.session.role === 'admin') {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Недостаточно прав' }, { status: 403 });
  }

  const teacherId = await findTeacherIdByUserId(guard.session.id);
  if (!teacherId) {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Нет профиля преподавателя' }, { status: 403 });
  }

  const params = await context.params;
  const body = (await request.json().catch(() => null)) as { acknowledged?: unknown } | null;
  if (!body || typeof body.acknowledged !== 'boolean') {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Некорректное тело запроса' }, { status: 400 });
  }

  const result = await setInstructionAcknowledgementBySlug({
    slug: params.slug,
    teacherId,
    acknowledged: body.acknowledged
  });

  if (!result) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Инструкция не найдена' }, { status: 404 });
  }

  return NextResponse.json(result);
}
