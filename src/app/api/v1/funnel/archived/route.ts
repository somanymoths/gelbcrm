import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listArchivedFunnelCards } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listArchivedFunnelCards();
  return NextResponse.json(items);
}
