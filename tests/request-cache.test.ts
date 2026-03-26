import { describe, expect, it } from 'vitest';
import {
  getRequestCacheStats,
  invalidateRequestCache,
  resetRequestCache,
  withShortTtlCache
} from '@/lib/request-cache';

describe('request-cache', () => {
  it('tracks hit/miss/pending and invalidation stats', async () => {
    resetRequestCache();
    let calls = 0;

    const loader = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true };
    };

    const first = withShortTtlCache('k:test', 1_000, loader);
    const second = withShortTtlCache('k:test', 1_000, loader);
    const [v1, v2] = await Promise.all([first, second]);
    expect(v1).toEqual({ ok: true });
    expect(v2).toEqual({ ok: true });
    expect(calls).toBe(1);

    const third = await withShortTtlCache('k:test', 1_000, loader);
    expect(third).toEqual({ ok: true });
    expect(calls).toBe(1);

    invalidateRequestCache('k:');
    expect(getRequestCacheStats().size).toBe(0);

    const stats = getRequestCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.pendingHits).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.writes).toBe(1);
    expect(stats.invalidations).toBeGreaterThanOrEqual(1);
  });
});
