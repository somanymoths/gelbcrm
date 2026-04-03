import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { mapInfraError } from '@/lib/api-error-mappers';
import { listPaymentHistory, reconcileYookassaPaymentsWithCardLinks, upsertYookassaPayment } from '@/lib/db';
import { syncCardPaymentStatusByLinkId, syncCardPaymentStatusByProviderPaymentId } from '@/lib/funnel';
import { getYooKassaPayment } from '@/lib/payments/yookassa';

function getYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    return null;
  }

  return { shopId, secretKey };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    await reconcileYookassaPaymentsWithCardLinks();
    const items = await listPaymentHistory();
    const credentials = getYooKassaCredentials();
    const pendingRows = items.filter((item) => item.status === 'pending').slice(0, 20);

    if (credentials && pendingRows.length > 0) {
      for (const row of pendingRows) {
        try {
          const latest = await getYooKassaPayment({
            shopId: credentials.shopId,
            secretKey: credentials.secretKey,
            paymentId: row.provider_payment_id
          });

          await upsertYookassaPayment({
            providerPaymentId: latest.id,
            status: latest.status,
            amount: latest.amountValue,
            currency: latest.amountCurrency,
            payerName: latest.metadata.payer_name ?? row.payer_name,
            payerEmail: latest.metadata.payer_email ?? row.payer_email,
            tariffName: latest.description ?? row.tariff_name,
            lessonsCount: latest.metadata.lessons_count ? Number(latest.metadata.lessons_count) : row.lessons_count,
            metadata: latest.metadata,
            paidAt: latest.capturedAt
          });

          const paymentLinkId = latest.metadata.payment_link_id?.trim() ?? '';
          if (paymentLinkId) {
            await syncCardPaymentStatusByLinkId({
              paymentLinkId,
              providerPaymentId: latest.id,
              providerStatus: latest.status,
              providerPaid: latest.paid,
              lessonsCount: latest.metadata.lessons_count ? Number(latest.metadata.lessons_count) : row.lessons_count
            });
            continue;
          }

          await syncCardPaymentStatusByProviderPaymentId({
            providerPaymentId: latest.id,
            providerStatus: latest.status,
            providerPaid: latest.paid,
            lessonsCount: latest.metadata.lessons_count ? Number(latest.metadata.lessons_count) : row.lessons_count
          });
        } catch (syncError) {
          console.error('payments-sync-error', {
            providerPaymentId: row.provider_payment_id,
            error: syncError instanceof Error ? syncError.message : String(syncError)
          });
        }
      }
    }

    await reconcileYookassaPaymentsWithCardLinks();
    const refreshedItems = await listPaymentHistory();
    return NextResponse.json(refreshedItems);
  } catch (error) {
    const infraError = mapInfraError(error, {
      misconfiguredMessage: 'Сервер не настроен: проверьте DB_* в .env.local',
      dbUnreachableMessage: 'Нет подключения к БД: проверьте DB_HOST/DB_PORT и доступность MySQL',
      dbAuthFailedMessage: 'Доступ к БД отклонён: проверьте DB_USERNAME/DB_PASSWORD/DB_DATABASE и права пользователя'
    });
    if (infraError) return infraError;

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось получить историю оплат' }, { status: 500 });
  }
}
