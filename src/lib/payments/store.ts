export type PaymentStatus = 'paid';

export type TariffPackage = {
  id: string;
  lessonsCount: number;
  pricePerLesson: number;
};

export type Tariff = {
  id: string;
  name: string;
  paymentLinkSlug: string;
  createdAt: string;
  packages: TariffPackage[];
};

export type PaymentRecord = {
  id: string;
  tariffId: string;
  tariffName: string;
  packageId: string;
  lessonsCount: number;
  amount: number;
  payerName: string;
  payerEmail: string;
  status: PaymentStatus;
  paidAt: string;
};

const TARIFFS_KEY = 'gelbcrm:tariffs';
const PAYMENTS_KEY = 'gelbcrm:payments';
const STORE_UPDATED_EVENT = 'gelbcrm:payments-store-updated';

function isBrowser() {
  return typeof window !== 'undefined';
}

function parseArray<T>(value: string | null): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function broadcastStoreUpdate() {
  if (!isBrowser()) {
    return;
  }

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
  if (!isBrowser()) {
    return [];
  }

  return parseArray<Tariff>(window.localStorage.getItem(TARIFFS_KEY));
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

  const tariffs = getTariffs();
  window.localStorage.setItem(TARIFFS_KEY, JSON.stringify([tariff, ...tariffs]));
  broadcastStoreUpdate();

  return tariff;
}

export function renameTariff(input: { tariffId: string; name: string }): Tariff | null {
  const nextName = input.name.trim();
  if (!nextName) {
    return null;
  }

  const tariffs = getTariffs();
  const index = tariffs.findIndex((item) => item.id === input.tariffId);

  if (index < 0) {
    return null;
  }

  const updated: Tariff = {
    ...tariffs[index],
    name: nextName
  };

  const nextTariffs = [...tariffs];
  nextTariffs[index] = updated;

  window.localStorage.setItem(TARIFFS_KEY, JSON.stringify(nextTariffs));
  broadcastStoreUpdate();

  return updated;
}

export function removeTariff(tariffId: string): boolean {
  const tariffs = getTariffs();
  const nextTariffs = tariffs.filter((item) => item.id !== tariffId);

  if (nextTariffs.length === tariffs.length) {
    return false;
  }

  window.localStorage.setItem(TARIFFS_KEY, JSON.stringify(nextTariffs));
  broadcastStoreUpdate();
  return true;
}

export function getTariffBySlug(slug: string): Tariff | null {
  const tariff = getTariffs().find((item) => item.paymentLinkSlug === slug);
  return tariff ?? null;
}

export function getPayments(): PaymentRecord[] {
  if (!isBrowser()) {
    return [];
  }

  return parseArray<PaymentRecord>(window.localStorage.getItem(PAYMENTS_KEY));
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

  const payments = getPayments();
  window.localStorage.setItem(PAYMENTS_KEY, JSON.stringify([payment, ...payments]));
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
