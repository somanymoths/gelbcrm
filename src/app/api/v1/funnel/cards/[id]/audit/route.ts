import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listCardAudit } from '@/lib/funnel';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const items = await listCardAudit({ cardId: id });
  return NextResponse.json(items);
}
