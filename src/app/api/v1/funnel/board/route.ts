import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listFunnelBoardCards, listFunnelStages } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const FUNNEL_BOARD_TTL_MS = 3_000;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const [stages, cards] = await withShortTtlCache(FunnelCacheKeys.board, FUNNEL_BOARD_TTL_MS, async () =>
    Promise.all([listFunnelStages(), listFunnelBoardCards()])
  );
  return NextResponse.json({ stages, cards });
}
