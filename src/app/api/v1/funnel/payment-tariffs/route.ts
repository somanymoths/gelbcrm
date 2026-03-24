import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys } from '@/lib/funnel-cache';
import { listPaymentTariffs } from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const PAYMENT_TARIFFS_TTL_MS = 30_000;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await withShortTtlCache(FunnelCacheKeys.paymentTariffs, PAYMENT_TARIFFS_TTL_MS, listPaymentTariffs);
  return NextResponse.json(items);
}
