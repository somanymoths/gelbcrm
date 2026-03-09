import { NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertYookassaPayment } from '@/lib/db';
import { syncCardPaymentStatusByProviderPaymentId } from '@/lib/funnel';

const webhookSchema = z.object({
  type: z.string().optional(),
  event: z.string(),
  object: z.object({
    id: z.string(),
    status: z.string(),
    paid: z.boolean().optional(),
    amount: z.object({
      value: z.string(),
      currency: z.string()
    }),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    captured_at: z.string().optional()
  })
});

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  return parsed;
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = webhookSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_PAYLOAD', message: 'Некорректный webhook payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const payment = payload.object;

  let amount = 0;

  try {
    amount = parseAmount(payment.amount.value);
  } catch {
    return NextResponse.json({ code: 'INVALID_AMOUNT', message: 'Некорректная сумма в webhook payload' }, { status: 400 });
  }

  try {
    await Promise.all([
      upsertYookassaPayment({
      providerPaymentId: payment.id,
      status: payment.status,
      amount,
      currency: payment.amount.currency,
      payerName: payment.metadata?.payer_name ?? null,
      payerEmail: payment.metadata?.payer_email ?? null,
      tariffName: payment.description ?? null,
      lessonsCount: payment.metadata?.lessons_count ? Number(payment.metadata.lessons_count) : null,
      metadata: payment.metadata ?? null,
      rawPayload: payload as unknown as Record<string, unknown>,
      paidAt: payment.captured_at ?? null
      }),
      syncCardPaymentStatusByProviderPaymentId({
        providerPaymentId: payment.id,
        providerStatus: payment.status
      })
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось обработать webhook' }, { status: 500 });
  }
}
