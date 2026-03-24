type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

const globalForRequestCache = globalThis as unknown as {
  requestCache?: Map<string, CacheEntry<unknown>>;
};

function getStore(): Map<string, CacheEntry<unknown>> {
  if (!globalForRequestCache.requestCache) {
    globalForRequestCache.requestCache = new Map<string, CacheEntry<unknown>>();
  }

  return globalForRequestCache.requestCache;
}

export async function withShortTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const store = getStore();
  const cached = store.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.pending) {
    return cached.pending;
  }

  const pending = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key);
    }
  }
}
