import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getPayments } from '@/app/api/v1/payments/route';
import { POST as postYookassaWebhook } from '@/app/api/v1/payments/webhook/yookassa/route';
import { requireAdmin } from '@/lib/api-auth';
import { listPaymentHistory, reconcileYookassaPaymentsWithCardLinks, upsertYookassaPayment } from '@/lib/db';
import { syncCardPaymentStatusByLinkId, syncCardPaymentStatusByProviderPaymentId } from '@/lib/funnel';
import { getYooKassaPayment } from '@/lib/payments/yookassa';

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  listPaymentHistory: vi.fn(),
  reconcileYookassaPaymentsWithCardLinks: vi.fn(),
  upsertYookassaPayment: vi.fn()
}));

vi.mock('@/lib/funnel', () => ({
  syncCardPaymentStatusByLinkId: vi.fn(),
  syncCardPaymentStatusByProviderPaymentId: vi.fn()
}));

vi.mock('@/lib/payments/yookassa', () => ({
  getYooKassaPayment: vi.fn()
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedListPaymentHistory = vi.mocked(listPaymentHistory);
const mockedReconcile = vi.mocked(reconcileYookassaPaymentsWithCardLinks);
const mockedUpsert = vi.mocked(upsertYookassaPayment);
const mockedSyncByLink = vi.mocked(syncCardPaymentStatusByLinkId);
const mockedSyncByProvider = vi.mocked(syncCardPaymentStatusByProviderPaymentId);
const mockedGetYooKassaPayment = vi.mocked(getYooKassaPayment);

describe('Payments routes regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOOKASSA_SHOP_ID = 'shop-test';
    process.env.YOOKASSA_SECRET_KEY = 'secret-test';

    mockedRequireAdmin.mockResolvedValue({
      session: { id: 'admin-1', role: 'admin', login: 'admin', sessionVersion: 1 }
    } as Awaited<ReturnType<typeof requireAdmin>>);
  });

  it('does not stop loop after link-based sync in /api/v1/payments', async () => {
    mockedReconcile.mockResolvedValue(undefined);
    mockedListPaymentHistory
      .mockResolvedValueOnce([
        {
          id: 1,
          provider_payment_id: 'pay-1',
          status: 'pending',
          amount: 100,
          currency: 'RUB',
          payer_name: 'A',
          payer_email: 'a@example.com',
          tariff_name: 'T1',
          lessons_count: 4,
          created_at: '2026-04-03 10:00:00',
          paid_at: null
        },
        {
          id: 2,
          provider_payment_id: 'pay-2',
          status: 'pending',
          amount: 200,
          currency: 'RUB',
          payer_name: 'B',
          payer_email: 'b@example.com',
          tariff_name: 'T2',
          lessons_count: 8,
          created_at: '2026-04-03 10:00:01',
          paid_at: null
        }
      ] as Awaited<ReturnType<typeof listPaymentHistory>>)
      .mockResolvedValueOnce([] as Awaited<ReturnType<typeof listPaymentHistory>>);

    mockedGetYooKassaPayment
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: 'pending',
        paid: true,
        amountValue: 100,
        amountCurrency: 'RUB',
        description: 'T1',
        metadata: { payment_link_id: 'link-1', lessons_count: '4' },
        capturedAt: '2026-04-03T03:02:12.507Z'
      })
      .mockResolvedValueOnce({
        id: 'pay-2',
        status: 'pending',
        paid: false,
        amountValue: 200,
        amountCurrency: 'RUB',
        description: 'T2',
        metadata: { lessons_count: '8' },
        capturedAt: null
      });

    const response = await getPayments();

    expect(response.status).toBe(200);
    expect(mockedSyncByLink).toHaveBeenCalledTimes(1);
    expect(mockedSyncByProvider).toHaveBeenCalledTimes(1);
    expect(mockedSyncByLink).toHaveBeenCalledWith(
      expect.objectContaining({ paymentLinkId: 'link-1', providerPaid: true, providerPaymentId: 'pay-1' })
    );
    expect(mockedSyncByProvider).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: 'pay-2', providerPaid: false })
    );
  });

  it('passes providerPaid from webhook to link sync', async () => {
    const response = await postYookassaWebhook(
      new Request('http://localhost/api/v1/payments/webhook/yookassa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.succeeded',
          object: {
            id: 'provider-1',
            status: 'pending',
            paid: true,
            amount: { value: '100.00', currency: 'RUB' },
            metadata: { payment_link_id: 'link-1', lessons_count: '4' },
            captured_at: '2026-04-03T03:02:12.507Z'
          }
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    expect(mockedSyncByLink).toHaveBeenCalledWith(
      expect.objectContaining({ paymentLinkId: 'link-1', providerPaymentId: 'provider-1', providerPaid: true })
    );
  });
});
