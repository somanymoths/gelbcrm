import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mapInfraError } from '@/lib/api-error-mappers';
import { upsertYookassaPayment } from '@/lib/db';
import { getCardPaymentLinkSyncContextById, syncCardPaymentStatusByLinkId } from '@/lib/funnel';
import { getYooKassaPayment } from '@/lib/payments/yookassa';

const schema = z.object({
  paymentLinkId: z.string().trim().uuid()
});

function getYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    return null;
  }

  return { shopId, secretKey };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные запроса' }, { status: 400 });
  }

  const credentials = getYooKassaCredentials();
  if (!credentials) {
    return NextResponse.json({ code: 'YOOKASSA_NOT_CONFIGURED', message: 'Платежная система не настроена на сервере' }, { status: 503 });
  }

  try {
    const link = await getCardPaymentLinkSyncContextById({ paymentLinkId: parsed.data.paymentLinkId });

    if (!link) {
      return NextResponse.json({ code: 'PAYMENT_LINK_NOT_FOUND', message: 'Ссылка оплаты не найдена' }, { status: 404 });
    }

    if (link.status === 'paid' || link.status === 'failed' || link.status === 'expired') {
      return NextResponse.json({ ok: true, status: link.status, synced: false });
    }

    // The link is created before real YooKassa payment exists.
    // In this case there is nothing to sync yet.
    if (link.providerPaymentId.startsWith('tariff-page-')) {
      return NextResponse.json({ ok: true, status: link.status, synced: false });
    }

    const latest = await getYooKassaPayment({
      shopId: credentials.shopId,
      secretKey: credentials.secretKey,
      paymentId: link.providerPaymentId
    });

    const lessonsCount = latest.metadata.lessons_count ? Number(latest.metadata.lessons_count) : link.lessonsCount;

    await upsertYookassaPayment({
      providerPaymentId: latest.id,
      status: latest.status,
      amount: latest.amountValue,
      currency: latest.amountCurrency,
      payerName: latest.metadata.payer_name ?? null,
      payerEmail: latest.metadata.payer_email ?? null,
      tariffName: latest.description ?? null,
      lessonsCount,
      metadata: latest.metadata,
      paidAt: latest.capturedAt
    });

    await syncCardPaymentStatusByLinkId({
      paymentLinkId: link.paymentLinkId,
      providerPaymentId: latest.id,
      providerStatus: latest.status,
      providerPaid: latest.paid,
      lessonsCount
    });

    const refreshed = await getCardPaymentLinkSyncContextById({ paymentLinkId: parsed.data.paymentLinkId });
    return NextResponse.json({ ok: true, status: refreshed?.status ?? link.status, synced: true });
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error('reconcile-payment-link-error', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось синхронизировать статус оплаты' }, { status: 500 });
  }
}
