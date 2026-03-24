import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listArchivedFunnelCards } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const ARCHIVED_CARDS_TTL_MS = 3_000;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await withShortTtlCache(FunnelCacheKeys.archived, ARCHIVED_CARDS_TTL_MS, listArchivedFunnelCards);
  return NextResponse.json(items);
}
