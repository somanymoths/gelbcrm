type IdempotencyEntry<T> = {
  expiresAt: number;
  pending?: Promise<T>;
  value?: T;
};

type IdempotencyStats = {
  hits: number;
  misses: number;
  pendingHits: number;
  writes: number;
  evictions: number;
};

const globalForIdempotency = globalThis as unknown as {
  idempotencyStore?: Map<string, IdempotencyEntry<unknown>>;
  idempotencyStats?: IdempotencyStats;
};

function getStore(): Map<string, IdempotencyEntry<unknown>> {
  if (!globalForIdempotency.idempotencyStore) {
    globalForIdempotency.idempotencyStore = new Map<string, IdempotencyEntry<unknown>>();
  }
  return globalForIdempotency.idempotencyStore;
}

function getStats(): IdempotencyStats {
  if (!globalForIdempotency.idempotencyStats) {
    globalForIdempotency.idempotencyStats = {
      hits: 0,
      misses: 0,
      pendingHits: 0,
      writes: 0,
      evictions: 0
    };
  }
  return globalForIdempotency.idempotencyStats;
}

function pruneExpiredEntries(store: Map<string, IdempotencyEntry<unknown>>, now: number): void {
  const stats = getStats();
  for (const [key, entry] of store.entries()) {
    if (!entry.pending && entry.expiresAt > 0 && entry.expiresAt <= now) {
      store.delete(key);
      stats.evictions += 1;
    }
  }
}

export function getIdempotencyKeyFromRequest(request: Request): string | null {
  const raw = request.headers.get('Idempotency-Key') ?? request.headers.get('X-Idempotency-Key');
  const key = raw?.trim();
  return key ? key : null;
}

export async function runIdempotent<T>(
  namespace: string,
  idempotencyKey: string | null,
  handler: () => Promise<T>,
  ttlMs = 5 * 60 * 1000
): Promise<T> {
  if (!idempotencyKey) {
    return handler();
  }

  const fullKey = `${namespace}:${idempotencyKey}`;
  const store = getStore();
  const stats = getStats();
  const now = Date.now();
  pruneExpiredEntries(store, now);
  const existing = store.get(fullKey) as IdempotencyEntry<T> | undefined;

  if (existing && existing.expiresAt <= now && !existing.pending) {
    store.delete(fullKey);
    stats.evictions += 1;
  }

  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    stats.hits += 1;
    return existing.value;
  }

  if (existing?.pending) {
    stats.pendingHits += 1;
    return existing.pending;
  }

  stats.misses += 1;

  const pending = handler()
    .then((value) => {
      store.set(fullKey, { value, expiresAt: Date.now() + ttlMs });
      stats.writes += 1;
      return value;
    })
    .catch((error) => {
      store.delete(fullKey);
      throw error;
    });

  store.set(fullKey, { pending, expiresAt: now + ttlMs });
  return pending;
}

export function getIdempotencyStats(): IdempotencyStats & { size: number } {
  const stats = getStats();
  return {
    ...stats,
    size: getStore().size
  };
}

export function resetIdempotencyStore(): void {
  getStore().clear();
  globalForIdempotency.idempotencyStats = {
    hits: 0,
    misses: 0,
    pendingHits: 0,
    writes: 0,
    evictions: 0
  };
}
