import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listTeacherDependencies, unbindAllStudentsAndDeleteTeacher } from '@/lib/db';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await unbindAllStudentsAndDeleteTeacher({
      teacherId: id,
      actorUserId: guard.session.id
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'DEPENDENCIES_REMAIN' || error.message === 'TEACHER_HAS_DEPENDENCIES')) {
      const students = await listTeacherDependencies({ id });
      return NextResponse.json(
        {
          code: 'DEPENDENCIES_REMAIN',
          message: 'Не удалось отвязать всех учеников',
          students
        },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'TEACHER_NOT_FOUND') {
      return NextResponse.json({ code: 'TEACHER_NOT_FOUND', message: 'Преподаватель не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось удалить преподавателя' }, { status: 500 });
  }
}
