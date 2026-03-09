import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { addCardComment, listCardComments } from '@/lib/funnel';

const createSchema = z.object({
  stageId: z.number().int().positive().optional().nullable(),
  body: z.string().trim().min(1)
});

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const items = await listCardComments({ cardId: id });
  return NextResponse.json(items);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные комментария' }, { status: 400 });
  }

  try {
    await addCardComment({
      cardId: id,
      stageId: parsed.data.stageId ?? null,
      body: parsed.data.body,
      authorId: guard.session.id
    });

    return new NextResponse(null, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'STUDENT_NOT_FOUND') {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (error instanceof Error && error.message === 'FUNNEL_STAGE_NOT_FOUND') {
      return NextResponse.json({ code: 'FUNNEL_STAGE_NOT_FOUND', message: 'Этап не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось добавить комментарий' }, { status: 500 });
  }
}
