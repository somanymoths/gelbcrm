import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { deleteSchoolLanguage } from '@/lib/db';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const languageId = Number(id);
  if (!Number.isInteger(languageId) || languageId <= 0) {
    return NextResponse.json({ code: 'INVALID_LANGUAGE_ID', message: 'Некорректный язык' }, { status: 400 });
  }

  try {
    await deleteSchoolLanguage({ id: languageId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'LANGUAGE_IN_USE') {
      return NextResponse.json(
        { code: 'LANGUAGE_IN_USE', message: 'Нельзя удалить язык: он используется преподавателями' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'LANGUAGE_NOT_FOUND') {
      return NextResponse.json({ code: 'LANGUAGE_NOT_FOUND', message: 'Язык не найден' }, { status: 404 });
    }

    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось удалить язык' }, { status: 500 });
  }
}
