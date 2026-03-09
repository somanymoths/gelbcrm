import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listFunnelStages } from '@/lib/db';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listFunnelStages();
  return NextResponse.json(items);
}
