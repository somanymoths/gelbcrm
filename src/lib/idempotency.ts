type IdempotencyEntry<T> = {
  expiresAt: number;
  pending?: Promise<T>;
  value?: T;
};

const globalForIdempotency = globalThis as unknown as {
  idempotencyStore?: Map<string, IdempotencyEntry<unknown>>;
};

function getStore(): Map<string, IdempotencyEntry<unknown>> {
  if (!globalForIdempotency.idempotencyStore) {
    globalForIdempotency.idempotencyStore = new Map<string, IdempotencyEntry<unknown>>();
  }
  return globalForIdempotency.idempotencyStore;
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
  const now = Date.now();
  const existing = store.get(fullKey) as IdempotencyEntry<T> | undefined;

  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.pending) {
    return existing.pending;
  }

  const pending = handler()
    .then((value) => {
      store.set(fullKey, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      store.delete(fullKey);
      throw error;
    });

  store.set(fullKey, { pending, expiresAt: now + ttlMs });
  return pending;
}
