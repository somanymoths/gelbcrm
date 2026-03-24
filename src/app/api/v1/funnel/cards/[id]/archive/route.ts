import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { archiveFunnelCard } from '@/lib/funnel';

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await archiveFunnelCard({ cardId: id, actorUserId: guard.session.id });
    invalidateFunnelCardCache(id);
    invalidateFunnelBoardRelatedCache();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'STUDENT_NOT_FOUND') {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось архивировать карточку' }, { status: 500 });
  }
}
