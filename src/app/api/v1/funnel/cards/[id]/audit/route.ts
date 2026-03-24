import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listCardAudit } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const items = await withShortTtlCache(FunnelCacheKeys.cardAudit(id), 2_000, () => listCardAudit({ cardId: id }));
  return NextResponse.json(items);
}
