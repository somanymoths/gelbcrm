import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayments, getTariffs, savePayment, saveTariff } from '@/lib/payments/store';

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  setThrowOnSet: (value: boolean) => void;
};

function createWindowMock(): { localStorage: LocalStorageMock; dispatchEvent: (event: Event) => boolean } {
  const store = new Map<string, string>();
  let throwOnSet = false;

  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (throwOnSet) throw new Error('QUOTA_EXCEEDED');
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      setThrowOnSet: (value: boolean) => {
        throwOnSet = value;
      }
    },
    dispatchEvent: vi.fn(() => true)
  };
}

function getWindowMock() {
  return (globalThis as unknown as { window: ReturnType<typeof createWindowMock> }).window;
}

describe('payments/store', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', {
      value: createWindowMock(),
      configurable: true
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
      return;
    }

    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true
    });
  });

  it('filters invalid stored payloads', () => {
    const windowMock = getWindowMock();
    windowMock.localStorage.setItem(
      'gelbcrm:tariffs',
      JSON.stringify([
        { id: 'ok', name: 'Tariff A', paymentLinkSlug: 'slug-a', createdAt: '2026-03-01', packages: [] },
        { id: null, name: 123 }
      ])
    );

    const tariffs = getTariffs();
    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]?.id).toBe('ok');
  });

  it('keeps in-memory fallback when localStorage write fails', () => {
    const windowMock = getWindowMock();
    const createdTariff = saveTariff({
      name: 'Main',
      packages: [{ lessonsCount: 8, pricePerLesson: 1200 }]
    });

    windowMock.localStorage.setThrowOnSet(true);
    const payment = savePayment({
      tariffId: createdTariff.id,
      tariffName: createdTariff.name,
      packageId: createdTariff.packages[0]!.id,
      lessonsCount: 8,
      amount: 9600,
      payerName: 'Test User',
      payerEmail: 'test@example.com'
    });

    const payments = getPayments();
    expect(payments).toHaveLength(1);
    expect(payments[0]?.id).toBe(payment.id);
  });
});
