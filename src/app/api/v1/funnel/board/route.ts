import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listFunnelBoardCards, listFunnelStages } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const [stages, cards] = await Promise.all([listFunnelStages(), listFunnelBoardCards()]);
  return NextResponse.json({ stages, cards });
}
