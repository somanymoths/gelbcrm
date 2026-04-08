import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/api-auth';
import {
  createInstructionDraft,
  findTeacherIdByUserId,
  listAcknowledgedInstructionIdsForTeacher,
  listInstructionsForRole
} from '@/lib/instructions-db';

export async function GET() {
  const guard = await requireUser();
  if (guard.error) return guard.error;

  const items = await listInstructionsForRole(guard.session.role).then((rows) =>
    rows.map((item) => ({ ...item, acknowledged: undefined as boolean | undefined }))
  );

  if (guard.session.role !== 'admin') {
    const teacherId = await findTeacherIdByUserId(guard.session.id);
    const acknowledgedIds = teacherId ? await listAcknowledgedInstructionIdsForTeacher(teacherId) : [];
    const acknowledgedSet = new Set(acknowledgedIds);
    items.forEach((item) => {
      item.acknowledged = acknowledgedSet.has(item.id);
    });
  }

  return NextResponse.json({ items });
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const instruction = await createInstructionDraft(guard.session.id);
  return NextResponse.json({ instruction }, { status: 201 });
}
