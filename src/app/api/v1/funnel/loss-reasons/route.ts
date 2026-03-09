import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listLossReasons } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listLossReasons();
  return NextResponse.json(items);
}
