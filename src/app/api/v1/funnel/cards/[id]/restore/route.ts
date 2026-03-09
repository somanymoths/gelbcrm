import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { restoreFunnelCard } from '@/lib/funnel';

const bodySchema = z.object({
  stageCode: z.string().trim().min(1)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Укажите этап восстановления' }, { status: 400 });
  }

  try {
    await restoreFunnelCard({
      cardId: id,
      stageCode: parsed.data.stageCode,
      actorUserId: guard.session.id
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownError(error, 'STUDENT_NOT_FOUND')) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (isKnownError(error, 'STUDENT_NOT_ARCHIVED')) {
      return NextResponse.json({ code: 'STUDENT_NOT_ARCHIVED', message: 'Карточка не в архиве' }, { status: 409 });
    }

    if (isKnownError(error, 'FUNNEL_STAGE_NOT_FOUND')) {
      return NextResponse.json({ code: 'FUNNEL_STAGE_NOT_FOUND', message: 'Этап не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось восстановить карточку' }, { status: 500 });
  }
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}
