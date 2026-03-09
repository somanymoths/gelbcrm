import { randomUUID } from 'crypto';

const YOOKASSA_API_BASE = 'https://api.yookassa.ru/v3';

export type YooKassaCreatePaymentInput = {
  shopId: string;
  secretKey: string;
  amountRub: number;
  returnUrl: string;
  description: string;
  metadata?: Record<string, string>;
};

export type YooKassaCreatePaymentResult = {
  id: string;
  status: string;
  paid: boolean;
  confirmationUrl: string;
};

export type YooKassaPaymentResult = {
  id: string;
  status: string;
  paid: boolean;
  amountValue: number;
  amountCurrency: string;
  description: string | null;
  metadata: Record<string, string>;
  capturedAt: string | null;
};

type YooKassaCreatePaymentResponse = {
  id?: string;
  status?: string;
  paid?: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  description?: string;
};

type YooKassaGetPaymentResponse = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  description?: string;
  metadata?: Record<string, string>;
  captured_at?: string;
};

type YooKassaErrorResponse = {
  type?: string;
  id?: string;
  code?: string;
  description?: string;
};

function toYooAmount(value: number) {
  return value.toFixed(2);
}

function toBasicAuth(shopId: string, secretKey: string) {
  return Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

function parseAmount(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('YooKassa вернула некорректную сумму платежа');
  }

  return parsed;
}

export async function createYooKassaPayment(input: YooKassaCreatePaymentInput): Promise<YooKassaCreatePaymentResult> {
  const response = await fetch(`${YOOKASSA_API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${toBasicAuth(input.shopId, input.secretKey)}`,
      'Idempotence-Key': randomUUID()
    },
    body: JSON.stringify({
      amount: {
        value: toYooAmount(input.amountRub),
        currency: 'RUB'
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: input.returnUrl
      },
      description: input.description,
      metadata: input.metadata
    })
  });

  if (!response.ok) {
    const errorJson = (await response.json().catch(() => null)) as YooKassaErrorResponse | null;
    const message = errorJson?.description ?? 'YooKassa вернула ошибку при создании платежа';

    throw new Error(message);
  }

  const json = (await response.json()) as YooKassaCreatePaymentResponse;

  if (!json.id || !json.status || !json.confirmation?.confirmation_url) {
    throw new Error('Некорректный ответ YooKassa: нет обязательных полей платежа');
  }

  return {
    id: json.id,
    status: json.status,
    paid: Boolean(json.paid),
    confirmationUrl: json.confirmation.confirmation_url
  };
}

export async function getYooKassaPayment(input: {
  shopId: string;
  secretKey: string;
  paymentId: string;
}): Promise<YooKassaPaymentResult> {
  const response = await fetch(`${YOOKASSA_API_BASE}/payments/${input.paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${toBasicAuth(input.shopId, input.secretKey)}`
    }
  });

  if (!response.ok) {
    const errorJson = (await response.json().catch(() => null)) as YooKassaErrorResponse | null;
    const message = errorJson?.description ?? 'YooKassa вернула ошибку при получении платежа';

    throw new Error(message);
  }

  const json = (await response.json()) as YooKassaGetPaymentResponse;

  if (!json.id || !json.status || !json.amount?.currency) {
    throw new Error('Некорректный ответ YooKassa: нет обязательных полей платежа');
  }

  return {
    id: json.id,
    status: json.status,
    paid: Boolean(json.paid),
    amountValue: parseAmount(json.amount.value),
    amountCurrency: json.amount.currency,
    description: json.description ?? null,
    metadata: json.metadata ?? {},
    capturedAt: json.captured_at ?? null
  };
}
