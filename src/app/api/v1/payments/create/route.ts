import { NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertYookassaPayment } from '@/lib/db';
import { createYooKassaPayment } from '@/lib/payments/yookassa';

const schema = z.object({
  amount: z.number().positive(),
  tariffName: z.string().trim().min(1).max(128),
  lessonsCount: z.number().int().positive(),
  payerName: z.string().trim().min(1).max(120),
  payerEmail: z.string().trim().email().max(255),
  returnUrl: z.string().trim().url(),
  metadata: z.record(z.string(), z.string()).optional()
});

function getYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_NOT_CONFIGURED');
  }

  return { shopId, secretKey };
}

function isMockPaymentsModeEnabled(): boolean {
  return process.env.PAYMENTS_MOCK_MODE === '1';
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректные данные для создания платежа' }, { status: 400 });
  }

  let credentials: { shopId: string; secretKey: string };

  const payload = parsed.data;

  try {
    if (isMockPaymentsModeEnabled()) {
      const paymentId = `mock-${Date.now()}`;
      await upsertYookassaPayment({
        providerPaymentId: paymentId,
        status: 'succeeded',
        amount: payload.amount,
        currency: 'RUB',
        payerName: payload.payerName,
        payerEmail: payload.payerEmail,
        tariffName: payload.tariffName,
        lessonsCount: payload.lessonsCount,
        metadata: {
          payer_name: payload.payerName,
          payer_email: payload.payerEmail,
          lessons_count: String(payload.lessonsCount),
          ...payload.metadata
        },
        paidAt: new Date().toISOString()
      });

      return NextResponse.json({
        paymentId,
        status: 'succeeded',
        paid: true,
        confirmationUrl: payload.returnUrl
      });
    }

    try {
      credentials = getYooKassaCredentials();
    } catch {
      return NextResponse.json(
        { code: 'YOOKASSA_NOT_CONFIGURED', message: 'Платежная система не настроена на сервере' },
        { status: 503 }
      );
    }

    const payment = await createYooKassaPayment({
      shopId: credentials.shopId,
      secretKey: credentials.secretKey,
      amountRub: payload.amount,
      returnUrl: payload.returnUrl,
      description: `Тариф ${payload.tariffName}, пакет ${payload.lessonsCount} занятий`,
      metadata: {
        payer_name: payload.payerName,
        payer_email: payload.payerEmail,
        lessons_count: String(payload.lessonsCount),
        ...payload.metadata
      }
    });

    await upsertYookassaPayment({
      providerPaymentId: payment.id,
      status: payment.status,
      amount: payload.amount,
      currency: 'RUB',
      payerName: payload.payerName,
      payerEmail: payload.payerEmail,
      tariffName: payload.tariffName,
      lessonsCount: payload.lessonsCount,
      metadata: {
        payer_name: payload.payerName,
        payer_email: payload.payerEmail,
        lessons_count: String(payload.lessonsCount),
        ...payload.metadata
      },
      paidAt: null
    });

    return NextResponse.json({
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      confirmationUrl: payment.confirmationUrl
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        code: 'YOOKASSA_CREATE_PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'Не удалось создать платеж в YooKassa'
      },
      { status: 502 }
    );
  }
}
