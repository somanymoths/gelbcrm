import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { archiveTeacher } from '@/lib/db';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await archiveTeacher({ id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TEACHER_NOT_FOUND') {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось архивировать преподавателя' }, { status: 500 });
  }
}
