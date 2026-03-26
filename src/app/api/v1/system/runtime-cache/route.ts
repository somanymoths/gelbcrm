import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getIdempotencyStats, resetIdempotencyStore } from '@/lib/idempotency';
import { getRequestCacheStats, resetRequestCache } from '@/lib/request-cache';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  return NextResponse.json({
    requestCache: getRequestCacheStats(),
    idempotency: getIdempotencyStats()
  });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? 'all';

  if (scope !== 'all' && scope !== 'request' && scope !== 'idempotency') {
    return NextResponse.json(
      { code: 'INVALID_SCOPE', message: 'scope должен быть all | request | idempotency' },
      { status: 400 }
    );
  }

  if (scope === 'all' || scope === 'request') {
    resetRequestCache();
  }
  if (scope === 'all' || scope === 'idempotency') {
    resetIdempotencyStore();
  }

  return NextResponse.json({
    reset: scope,
    requestCache: getRequestCacheStats(),
    idempotency: getIdempotencyStats()
  });
}
