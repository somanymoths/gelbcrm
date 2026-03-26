import { z } from 'zod';

export type PaymentStatus = 'paid';

const TariffPackageSchema = z.object({
  id: z.string().min(1),
  lessonsCount: z.number().int().positive(),
  pricePerLesson: z.number().finite().nonnegative()
});

const TariffSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  paymentLinkSlug: z.string().min(1),
  createdAt: z.string().min(1),
  packages: z.array(TariffPackageSchema)
});

const PaymentRecordSchema = z.object({
  id: z.string().min(1),
  tariffId: z.string().min(1),
  tariffName: z.string().min(1),
  packageId: z.string().min(1),
  lessonsCount: z.number().int().positive(),
  amount: z.number().finite().positive(),
  payerName: z.string().min(1),
  payerEmail: z.string().min(1),
  status: z.literal('paid'),
  paidAt: z.string().min(1)
});

export type TariffPackage = z.infer<typeof TariffPackageSchema>;
export type Tariff = z.infer<typeof TariffSchema>;
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

const TARIFFS_KEY = 'gelbcrm:tariffs';
const PAYMENTS_KEY = 'gelbcrm:payments';
const STORE_UPDATED_EVENT = 'gelbcrm:payments-store-updated';

const memoryStore: { tariffs: Tariff[]; payments: PaymentRecord[] } = {
  tariffs: [],
  payments: []
};

type CollectionKey = keyof typeof memoryStore;
type CollectionItem<K extends CollectionKey> = (typeof memoryStore)[K][number];

function isBrowser() {
  return typeof window !== 'undefined';
}

function parseStoredArray<T>(raw: string | null, itemSchema: z.ZodType<T>): T[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const checked = itemSchema.safeParse(item);
      return checked.success ? [checked.data] : [];
    });
  } catch {
    return [];
  }
}

function writeCollection<K extends CollectionKey>(
  key: string,
  fallbackKey: K,
  items: Array<CollectionItem<K>>
): void {
  if (fallbackKey === 'tariffs') {
    memoryStore.tariffs = items as Tariff[];
  } else {
    memoryStore.payments = items as PaymentRecord[];
  }

  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Keep a valid in-memory snapshot for this tab if localStorage is unavailable.
  }
}

function readCollection<K extends CollectionKey>(
  key: string,
  itemSchema: z.ZodType<CollectionItem<K>>,
  fallbackKey: K
): Array<CollectionItem<K>> {
  if (!isBrowser()) {
    if (fallbackKey === 'tariffs') return [...memoryStore.tariffs] as Array<CollectionItem<K>>;
    return [...memoryStore.payments] as Array<CollectionItem<K>>;
  }

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = parseStoredArray(raw, itemSchema);
    if (fallbackKey === 'tariffs') {
      memoryStore.tariffs = parsed as Tariff[];
    } else {
      memoryStore.payments = parsed as PaymentRecord[];
    }
    return parsed;
  } catch {
    if (fallbackKey === 'tariffs') return [...memoryStore.tariffs] as Array<CollectionItem<K>>;
    return [...memoryStore.payments] as Array<CollectionItem<K>>;
  }
}

function broadcastStoreUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(STORE_UPDATED_EVENT));
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSlug() {
  return `tariff-${Math.random().toString(36).slice(2, 10)}`;
}

export function getStoreUpdateEventName() {
  return STORE_UPDATED_EVENT;
}

export function getTariffs(): Tariff[] {
  return readCollection(TARIFFS_KEY, TariffSchema, 'tariffs');
}

export function saveTariff(input: { name: string; packages: Array<{ lessonsCount: number; pricePerLesson: number }> }): Tariff {
  const tariff: Tariff = {
    id: createId(),
    name: input.name.trim(),
    paymentLinkSlug: createSlug(),
    createdAt: new Date().toISOString(),
    packages: input.packages.map((pkg) => ({
      id: createId(),
      lessonsCount: pkg.lessonsCount,
      pricePerLesson: pkg.pricePerLesson
    }))
  };

  writeCollection(TARIFFS_KEY, 'tariffs', [tariff, ...getTariffs()]);
  broadcastStoreUpdate();
  return tariff;
}

export function renameTariff(input: { tariffId: string; name: string }): Tariff | null {
  const nextName = input.name.trim();
  if (!nextName) return null;

  const tariffs = getTariffs();
  const index = tariffs.findIndex((item) => item.id === input.tariffId);
  if (index < 0) return null;

  const updated: Tariff = {
    ...tariffs[index],
    name: nextName
  };

  const nextTariffs = [...tariffs];
  nextTariffs[index] = updated;
  writeCollection(TARIFFS_KEY, 'tariffs', nextTariffs);
  broadcastStoreUpdate();
  return updated;
}

export function removeTariff(tariffId: string): boolean {
  const tariffs = getTariffs();
  const nextTariffs = tariffs.filter((item) => item.id !== tariffId);
  if (nextTariffs.length === tariffs.length) return false;

  writeCollection(TARIFFS_KEY, 'tariffs', nextTariffs);
  broadcastStoreUpdate();
  return true;
}

export function getTariffBySlug(slug: string): Tariff | null {
  return getTariffs().find((item) => item.paymentLinkSlug === slug) ?? null;
}

export function getPayments(): PaymentRecord[] {
  return readCollection(PAYMENTS_KEY, PaymentRecordSchema, 'payments');
}

export function savePayment(input: {
  tariffId: string;
  tariffName: string;
  packageId: string;
  lessonsCount: number;
  amount: number;
  payerName: string;
  payerEmail: string;
}): PaymentRecord {
  const payment: PaymentRecord = {
    id: createId(),
    tariffId: input.tariffId,
    tariffName: input.tariffName,
    packageId: input.packageId,
    lessonsCount: input.lessonsCount,
    amount: input.amount,
    payerName: input.payerName.trim(),
    payerEmail: input.payerEmail.trim(),
    status: 'paid',
    paidAt: new Date().toISOString()
  };

  writeCollection(PAYMENTS_KEY, 'payments', [payment, ...getPayments()]);
  broadcastStoreUpdate();
  return payment;
}

export function getTariffPaymentLink(slug: string) {
  if (!isBrowser()) {
    return `/payment-links/${slug}`;
  }

  return `${window.location.origin}/payment-links/${slug}`;
}

export function getPackageTotal(pkg: Pick<TariffPackage, 'lessonsCount' | 'pricePerLesson'>) {
  return pkg.lessonsCount * pkg.pricePerLesson;
}
