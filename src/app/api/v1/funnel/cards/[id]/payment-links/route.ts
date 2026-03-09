import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import {
  createCardPaymentLinkRecord,
  getTariffPackageForPayment,
  listCardPaymentLinks
} from '@/lib/funnel';
import { createYooKassaPayment } from '@/lib/payments/yookassa';
import { upsertYookassaPayment } from '@/lib/db';

const createSchema = z.object({
  tariffPackageId: z.string().trim().uuid(),
  returnUrl: z.string().trim().url().optional()
});

function getYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_NOT_CONFIGURED');
  }

  return { shopId, secretKey };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const items = await listCardPaymentLinks({ cardId: id });
  return NextResponse.json(items);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные для создания ссылки оплаты' }, { status: 400 });
  }

  let credentials: { shopId: string; secretKey: string };

  try {
    credentials = getYooKassaCredentials();
  } catch {
    return NextResponse.json(
      { code: 'YOOKASSA_NOT_CONFIGURED', message: 'YooKassa не настроена на сервере' },
      { status: 503 }
    );
  }

  const tariffPackage = await getTariffPackageForPayment({ tariffPackageId: parsed.data.tariffPackageId });

  if (!tariffPackage) {
    return NextResponse.json({ code: 'TARIFF_PACKAGE_NOT_FOUND', message: 'Пакет тарифа не найден' }, { status: 404 });
  }

  const returnUrl = parsed.data.returnUrl ?? process.env.APP_URL ?? 'http://localhost:3000/funnel';

  try {
    const payment = await createYooKassaPayment({
      shopId: credentials.shopId,
      secretKey: credentials.secretKey,
      amountRub: tariffPackage.total_price_rub,
      returnUrl,
      description: `${tariffPackage.tariff_name}: ${tariffPackage.lessons_count} занятий`,
      metadata: {
        student_id: id,
        tariff_package_id: tariffPackage.id,
        lessons_count: String(tariffPackage.lessons_count)
      }
    });

    await Promise.all([
      createCardPaymentLinkRecord({
        cardId: id,
        actorUserId: guard.session.id,
        tariffPackageId: tariffPackage.id,
        providerPaymentId: payment.id,
        paymentUrl: payment.confirmationUrl,
        amount: tariffPackage.total_price_rub,
        currency: 'RUB',
        expiresAt: null
      }),
      upsertYookassaPayment({
        providerPaymentId: payment.id,
        status: payment.status,
        amount: tariffPackage.total_price_rub,
        currency: 'RUB',
        tariffName: tariffPackage.tariff_name,
        lessonsCount: tariffPackage.lessons_count,
        metadata: {
          student_id: id,
          tariff_package_id: tariffPackage.id,
          lessons_count: String(tariffPackage.lessons_count)
        },
        paidAt: null
      })
    ]);

    return NextResponse.json(
      {
        paymentId: payment.id,
        status: payment.status,
        confirmationUrl: payment.confirmationUrl
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'STUDENT_NOT_FOUND') {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    if (error instanceof Error && error.message === 'TARIFF_PACKAGE_NOT_FOUND') {
      return NextResponse.json({ code: 'TARIFF_PACKAGE_NOT_FOUND', message: 'Пакет тарифа не найден' }, { status: 404 });
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось создать ссылку оплаты' }, { status: 500 });
  }
}
