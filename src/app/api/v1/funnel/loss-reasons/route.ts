import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listLossReasons } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const LOSS_REASONS_TTL_MS = 30_000;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await withShortTtlCache(FunnelCacheKeys.lossReasons, LOSS_REASONS_TTL_MS, listLossReasons);
  return NextResponse.json(items);
}
