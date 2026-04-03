import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn().mockResolvedValue([[], []]));

vi.mock('@/lib/mysql-pool', () => ({
  getMysqlPool: () => ({ query: queryMock })
}));

import { upsertYookassaPayment } from '@/lib/db';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Payments DB regression', () => {
  it('converts ISO paidAt to MySQL DATETIME before upsert', async () => {
    await upsertYookassaPayment({
      providerPaymentId: 'provider-1',
      status: 'succeeded',
      amount: 100,
      currency: 'RUB',
      paidAt: '2026-04-03T03:02:12.507Z'
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[10]).toBe('2026-04-03 03:02:12');
  });
});
