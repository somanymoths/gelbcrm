import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listTeacherDependencies } from '@/lib/db';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const students = await listTeacherDependencies({ id });
  return NextResponse.json({ students });
}
