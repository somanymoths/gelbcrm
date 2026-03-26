import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/v1/system/runtime-cache/route';
import { requireAdmin } from '@/lib/api-auth';
import {
  getRequestCacheStats,
  resetRequestCache
} from '@/lib/request-cache';
import {
  getIdempotencyStats,
  resetIdempotencyStore
} from '@/lib/idempotency';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn()
}));

vi.mock('@/lib/request-cache', () => ({
  getRequestCacheStats: vi.fn(),
  resetRequestCache: vi.fn()
}));

vi.mock('@/lib/idempotency', () => ({
  getIdempotencyStats: vi.fn(),
  resetIdempotencyStore: vi.fn()
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedGetRequestCacheStats = vi.mocked(getRequestCacheStats);
const mockedResetRequestCache = vi.mocked(resetRequestCache);
const mockedGetIdempotencyStats = vi.mocked(getIdempotencyStats);
const mockedResetIdempotencyStore = vi.mocked(resetIdempotencyStore);

describe('runtime-cache route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue({ session: { id: 'admin-1', role: 'admin', login: 'admin' } });
    mockedGetRequestCacheStats.mockReturnValue({
      hits: 0,
      misses: 0,
      pendingHits: 0,
      writes: 0,
      invalidations: 0,
      evictions: 0,
      size: 0
    });
    mockedGetIdempotencyStats.mockReturnValue({
      hits: 0,
      misses: 0,
      pendingHits: 0,
      writes: 0,
      evictions: 0,
      size: 0
    });
  });

  it('returns stats for admin', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { requestCache: unknown; idempotency: unknown };
    expect(body.requestCache).toBeDefined();
    expect(body.idempotency).toBeDefined();
  });

  it('rejects invalid scope in reset', async () => {
    const response = await POST(new Request('http://localhost/api/v1/system/runtime-cache?scope=bad'));
    expect(response.status).toBe(400);
    expect(mockedResetRequestCache).not.toHaveBeenCalled();
    expect(mockedResetIdempotencyStore).not.toHaveBeenCalled();
  });

  it('resets request cache for scope=request', async () => {
    const response = await POST(new Request('http://localhost/api/v1/system/runtime-cache?scope=request', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(mockedResetRequestCache).toHaveBeenCalledTimes(1);
    expect(mockedResetIdempotencyStore).not.toHaveBeenCalled();
  });
});
