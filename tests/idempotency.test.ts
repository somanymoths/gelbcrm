import { describe, expect, it } from 'vitest';
import {
  getIdempotencyStats,
  getIdempotencyKeyFromRequest,
  resetIdempotencyStore,
  runIdempotent
} from '@/lib/idempotency';

describe('idempotency', () => {
  it('extracts idempotency key from headers', () => {
    const request = new Request('http://localhost/test', {
      headers: {
        'X-Idempotency-Key': '  key-123  '
      }
    });
    expect(getIdempotencyKeyFromRequest(request)).toBe('key-123');
  });

  it('deduplicates concurrent requests and tracks stats', async () => {
    resetIdempotencyStore();
    let calls = 0;

    const handler = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { created: true };
    };

    const first = runIdempotent('ns', 'same', handler, 5_000);
    const second = runIdempotent('ns', 'same', handler, 5_000);
    const [v1, v2] = await Promise.all([first, second]);
    expect(v1).toEqual({ created: true });
    expect(v2).toEqual({ created: true });
    expect(calls).toBe(1);

    const third = await runIdempotent('ns', 'same', handler, 5_000);
    expect(third).toEqual({ created: true });
    expect(calls).toBe(1);

    const stats = getIdempotencyStats();
    expect(stats.misses).toBe(1);
    expect(stats.pendingHits).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.writes).toBe(1);
  });
});
