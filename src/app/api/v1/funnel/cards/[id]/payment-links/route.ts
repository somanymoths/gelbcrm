import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { FunnelCacheKeys, invalidateFunnelCardCache } from '@/lib/funnel-cache';
import {
  createCardPaymentLinkRecord,
  deleteActiveCardPaymentLink,
  expireCardPaymentLink,
  getActiveCardPaymentLink,
  getActiveCardPaymentLinkForRefresh,
  getFunnelCardById,
  listPaymentTariffs,
  listCardPaymentLinks
} from '@/lib/funnel';
import { withShortTtlCache } from '@/lib/request-cache';

const createSchema = z.object({
  tariffGridId: z.string().trim().uuid().optional(),
  refreshActive: z.boolean().optional()
}).refine((payload) => payload.refreshActive === true || Boolean(payload.tariffGridId), {
  message: 'tariffGridId is required when refreshActive is false',
  path: ['tariffGridId']
});

function resolvePublicAppBaseUrl(request: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && !/localhost|127\.0\.0\.1/i.test(envUrl)) {
    return envUrl;
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.trim();
  if (forwardedHost && !/localhost|127\.0\.0\.1/i.test(forwardedHost)) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.trim() || 'https';
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get('host')?.trim();
  if (host && !/localhost|127\.0\.0\.1/i.test(host)) {
    const proto = request.headers.get('x-forwarded-proto')?.trim() || 'https';
    return `${proto}://${host}`;
  }

  return 'https://gelbcrm.ru';
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const items = await withShortTtlCache(FunnelCacheKeys.cardPaymentLinks(id), 2_000, () => listCardPaymentLinks({ cardId: id }));
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

  try {
    const card = await getFunnelCardById({ cardId: id });
    if (!card) {
      return NextResponse.json({ code: 'STUDENT_NOT_FOUND', message: 'Карточка не найдена' }, { status: 404 });
    }

    let selectedTariffGridId: string;
    let selectedTariffPackageId: string;
    let selectedPackageAmount: number;

    if (parsed.data.refreshActive === true) {
      const activeForRefresh = await getActiveCardPaymentLinkForRefresh({ cardId: id });
      if (!activeForRefresh) {
        return NextResponse.json(
          { code: 'ACTIVE_PAYMENT_LINK_NOT_FOUND', message: 'Активная ссылка для обновления не найдена' },
          { status: 404 }
        );
      }

      await expireCardPaymentLink({ cardId: id, linkId: activeForRefresh.linkId });
      selectedTariffGridId = activeForRefresh.tariffPackage.tariff_grid_id;
      selectedTariffPackageId = activeForRefresh.tariffPackage.id;
      selectedPackageAmount = activeForRefresh.tariffPackage.total_price_rub;
    } else {
      const activeLink = await getActiveCardPaymentLink({ cardId: id });
      if (activeLink) {
        return NextResponse.json(
          {
            code: 'ACTIVE_PAYMENT_LINK_EXISTS',
            message: 'У ученика уже есть активная ссылка оплаты',
            activeLink
          },
          { status: 409 }
        );
      }

      const tariffs = await withShortTtlCache(FunnelCacheKeys.paymentTariffs, 30_000, listPaymentTariffs);
      const selectedTariff = tariffs.find((item) => item.id === parsed.data.tariffGridId);

      if (!selectedTariff) {
        return NextResponse.json({ code: 'TARIFF_GRID_NOT_FOUND', message: 'Тариф не найден' }, { status: 404 });
      }

      const defaultPackage = selectedTariff.packages[0];
      if (!defaultPackage) {
        return NextResponse.json(
          { code: 'TARIFF_HAS_NO_PACKAGES', message: 'У выбранного тарифа нет активных пакетов' },
          { status: 409 }
        );
      }

      selectedTariffGridId = selectedTariff.id;
      selectedTariffPackageId = defaultPackage.id;
      selectedPackageAmount = defaultPackage.total_price_rub;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const paymentLinkId = randomUUID();
    const appBaseUrl = resolvePublicAppBaseUrl(request);
    const tariffPageUrl = new URL(`/payment-links/${selectedTariffGridId}`, appBaseUrl);
    const payerName = [card.first_name?.trim() ?? '', card.last_name?.trim() ?? ''].filter(Boolean).join(' ').trim() || card.full_name?.trim() || '';
    const payerEmail = card.email?.trim() ?? '';

    if (payerName) tariffPageUrl.searchParams.set('name', payerName);
    if (payerEmail) tariffPageUrl.searchParams.set('email', payerEmail);
    tariffPageUrl.searchParams.set('expiresAt', expiresAt);
    tariffPageUrl.searchParams.set('paymentLinkId', paymentLinkId);

    const providerPaymentId = `tariff-page-${randomUUID()}`;

    await createCardPaymentLinkRecord({
      cardId: id,
      actorUserId: guard.session.id,
      linkId: paymentLinkId,
      tariffPackageId: selectedTariffPackageId,
      providerPaymentId,
      paymentUrl: tariffPageUrl.toString(),
      amount: selectedPackageAmount,
      currency: 'RUB',
      expiresAt
    });
    invalidateFunnelCardCache(id);

    return NextResponse.json(
      {
        paymentId: providerPaymentId,
        status: 'pending',
        confirmationUrl: tariffPageUrl.toString(),
        expiresAt
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

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await context.params;

  try {
    await deleteActiveCardPaymentLink({ cardId: id, actorUserId: guard.session.id });
    invalidateFunnelCardCache(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACTIVE_PAYMENT_LINK_NOT_FOUND') {
      return NextResponse.json(
        { code: 'ACTIVE_PAYMENT_LINK_NOT_FOUND', message: 'Активная ссылка не найдена' },
        { status: 404 }
      );
    }

    console.error(error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Не удалось удалить активную ссылку' }, { status: 500 });
  }
}
