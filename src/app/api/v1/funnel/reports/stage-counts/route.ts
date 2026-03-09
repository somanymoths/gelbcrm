import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getStageCountsReport } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await getStageCountsReport();
  return NextResponse.json(items);
}
