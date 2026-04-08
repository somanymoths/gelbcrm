import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/api-auth';
import {
  deleteInstructionBySlug,
  findTeacherIdByUserId,
  getInstructionAcknowledgeStateForTeacher,
  listInstructionTeacherAcks,
  resolveInstructionAccessView,
  updateInstructionBySlug
} from '@/lib/instructions-db';
import type { InstructionStatus } from '@/lib/instructions';

function parseStatus(value: unknown): InstructionStatus | null {
  if (value === 'draft' || value === 'published') return value;
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;

  const params = await context.params;
  const view = await resolveInstructionAccessView({ slug: params.slug, role: guard.session.role });

  if (view.notFound) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Инструкция не найдена' }, { status: 404 });
  }

  if (view.unavailable) {
    return NextResponse.json(
      {
        code: 'INSTRUCTION_UNAVAILABLE',
        message: 'Инструкция недоступна',
        redirectTo: view.redirectedFromSlug ? `/instructions/${view.instruction.slug}` : null
      },
      { status: 403 }
    );
  }

  if (guard.session.role === 'admin') {
    const teacherAcks = await listInstructionTeacherAcks(view.instruction.id);
    const acknowledged = teacherAcks.filter((item) => item.acknowledgedAt);
    const notAcknowledged = teacherAcks.filter((item) => !item.acknowledgedAt);

    return NextResponse.json({
      instruction: view.instruction,
      redirectedFromSlug: view.redirectedFromSlug,
      teacherAcknowledgements: {
        acknowledged,
        notAcknowledged
      }
    });
  }

  const teacherId = await findTeacherIdByUserId(guard.session.id);
  const acknowledgeState = teacherId
    ? await getInstructionAcknowledgeStateForTeacher({ instructionId: view.instruction.id, teacherId })
    : { acknowledged: false, acknowledgedAt: null };

  return NextResponse.json({
    instruction: view.instruction,
    redirectedFromSlug: view.redirectedFromSlug,
    acknowledgeState
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const params = await context.params;
  const body = (await request.json().catch(() => null)) as {
    contentJson?: unknown;
    contentHtml?: unknown;
    status?: unknown;
  } | null;

  if (!body || typeof body.contentHtml !== 'string') {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Некорректное тело запроса' }, { status: 400 });
  }

  const status = parseStatus(body.status);
  if (!status) {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Некорректный статус' }, { status: 400 });
  }

  const updated = await updateInstructionBySlug({
    slug: params.slug,
    actorUserId: guard.session.id,
    contentJson: body.contentJson,
    contentHtml: body.contentHtml,
    status
  });

  if (!updated) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Инструкция не найдена' }, { status: 404 });
  }

  return NextResponse.json({ instruction: updated });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const params = await context.params;
  const deleted = await deleteInstructionBySlug(params.slug);

  if (!deleted) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Инструкция не найдена' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
