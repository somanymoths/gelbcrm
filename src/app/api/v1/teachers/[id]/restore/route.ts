import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { restoreTeacher } from '@/lib/db';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await restoreTeacher({ id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TEACHER_NOT_FOUND') {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось восстановить преподавателя' }, { status: 500 });
  }
}
