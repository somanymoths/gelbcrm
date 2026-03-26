import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getIdempotencyStats } from '@/lib/idempotency';
import { getRequestCacheStats } from '@/lib/request-cache';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  return NextResponse.json({
    requestCache: getRequestCacheStats(),
    idempotency: getIdempotencyStats()
  });
}
