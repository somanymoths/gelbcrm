type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

type RequestCacheStats = {
  hits: number;
  misses: number;
  pendingHits: number;
  writes: number;
  invalidations: number;
  evictions: number;
};

const globalForRequestCache = globalThis as unknown as {
  requestCache?: Map<string, CacheEntry<unknown>>;
  requestCacheStats?: RequestCacheStats;
};

function getStore(): Map<string, CacheEntry<unknown>> {
  if (!globalForRequestCache.requestCache) {
    globalForRequestCache.requestCache = new Map<string, CacheEntry<unknown>>();
  }

  return globalForRequestCache.requestCache;
}

function getStats(): RequestCacheStats {
  if (!globalForRequestCache.requestCacheStats) {
    globalForRequestCache.requestCacheStats = {
      hits: 0,
      misses: 0,
      pendingHits: 0,
      writes: 0,
      invalidations: 0,
      evictions: 0
    };
  }

  return globalForRequestCache.requestCacheStats;
}

function pruneExpiredEntries(store: Map<string, CacheEntry<unknown>>, now: number): void {
  const stats = getStats();
  for (const [key, entry] of store.entries()) {
    if (!entry.pending && entry.expiresAt > 0 && entry.expiresAt <= now) {
      store.delete(key);
      stats.evictions += 1;
    }
  }
}

export async function withShortTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const store = getStore();
  const stats = getStats();
  pruneExpiredEntries(store, now);
  const cached = store.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.value !== undefined && cached.expiresAt > now) {
    stats.hits += 1;
    return cached.value;
  }

  if (cached?.pending) {
    stats.pendingHits += 1;
    return cached.pending;
  }

  stats.misses += 1;

  const pending = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      stats.writes += 1;
      return value;
    })
    .finally(() => {
      const latest = store.get(key) as CacheEntry<T> | undefined;
      if (latest?.pending) {
        store.set(key, { value: latest.value, expiresAt: latest.expiresAt });
      }
    });

  store.set(key, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    pending
  });

  return pending;
}

export function invalidateRequestCache(keyPrefix: string): void {
  const store = getStore();
  const stats = getStats();
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key);
      stats.invalidations += 1;
    }
  }
}

export function getRequestCacheStats(): RequestCacheStats & { size: number } {
  const stats = getStats();
  return {
    ...stats,
    size: getStore().size
  };
}

export function resetRequestCache(): void {
  getStore().clear();
  globalForRequestCache.requestCacheStats = {
    hits: 0,
    misses: 0,
    pendingHits: 0,
    writes: 0,
    invalidations: 0,
    evictions: 0
  };
}
