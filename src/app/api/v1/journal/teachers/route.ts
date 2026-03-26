import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { findTeacherByUserId, listActiveTeachersForJournal } from '@/lib/db';

export async function GET() {
  try {
    const guard = await requireUser();
    if (guard.error) return guard.error;

    if (guard.session.role === 'admin') {
      const items = await listActiveTeachersForJournal();
      return NextResponse.json(items);
    }

    const teacher = await findTeacherByUserId(guard.session.id);
    if (!teacher) {
      return NextResponse.json({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Профиль преподавателя не найден' }, { status: 404 });
    }
    return NextResponse.json([teacher]);
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось загрузить преподавателей' }, { status: 500 });
  }
}
