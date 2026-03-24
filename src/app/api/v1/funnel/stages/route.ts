import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listFunnelStages } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const FUNNEL_STAGES_TTL_MS = 30_000;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await withShortTtlCache(FunnelCacheKeys.stages, FUNNEL_STAGES_TTL_MS, listFunnelStages);
  return NextResponse.json(items);
}
