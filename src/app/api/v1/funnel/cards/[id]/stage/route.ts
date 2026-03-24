import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { invalidateFunnelBoardRelatedCache, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import { updateFunnelCardStage } from '@/lib/funnel';

const bodySchema = z.object({
  stageCode: z.string().trim().min(1),
  lossReasonId: z.number().int().positive().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные этапа' }, { status: 400 });
  }

  try {
    await updateFunnelCardStage({
      cardId: id,
      stageCode: parsed.data.stageCode,
      lossReasonId: parsed.data.lossReasonId,
      actorUserId: guard.session.id
    });
    invalidateFunnelCardCache(id);
    invalidateFunnelBoardRelatedCache();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownError(error, 'STUDENT_NOT_FOUND')) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (isKnownError(error, 'FUNNEL_STAGE_NOT_FOUND')) {
      return NextResponse.json({ code: 'FUNNEL_STAGE_NOT_FOUND', message: 'Этап не найден' }, { status: 404 });
    }

    if (isKnownError(error, 'LOSS_REASON_REQUIRED')) {
      return NextResponse.json({ code: 'LOSS_REASON_REQUIRED', message: 'Выберите причину потери' }, { status: 422 });
    }

    if (isKnownError(error, 'LOSS_REASON_NOT_FOUND')) {
      return NextResponse.json({ code: 'LOSS_REASON_NOT_FOUND', message: 'Причина потери не найдена' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обновить этап' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}
