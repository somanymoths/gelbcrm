import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { unbindStudentsFromTeacher } from '@/lib/db';

const schema = z.object({
  studentIds: z.array(z.string().uuid()).default([])
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректный список учеников' }, { status: 400 });
  }

  const affected = await unbindStudentsFromTeacher({
    teacherId: id,
    studentIds: parsed.data.studentIds,
    actorUserId: guard.session.id
  });

  return NextResponse.json({ affected });
}
