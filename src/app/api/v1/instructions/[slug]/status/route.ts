import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { updateInstructionStatusBySlug } from '@/lib/instructions-db';
import type { InstructionStatus } from '@/lib/instructions';

function parseStatus(value: unknown): InstructionStatus | null {
  if (value === 'draft' || value === 'published') return value;
  return null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const params = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = parseStatus(body?.status);

  if (!status) {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Некорректный статус' }, { status: 400 });
  }

  const updated = await updateInstructionStatusBySlug({
    slug: params.slug,
    actorUserId: guard.session.id,
    status
  });

  if (!updated) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Инструкция не найдена' }, { status: 404 });
  }

  return NextResponse.json({ instruction: updated });
}

