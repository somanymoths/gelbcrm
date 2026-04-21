'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRub } from '@/lib/payments/format';

type CreatePaymentApiResponse = {
  paymentId: string;
  status: string;
  paid: boolean;
  confirmationUrl: string;
};

type ReconcilePaymentApiResponse = {
  ok: boolean;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  synced: boolean;
};

type PublicTariffPackage = {
  id: string;
  lessons_count: number;
  price_per_lesson_rub: number;
  total_price_rub: number;
};

type PublicTariff = {
  id: string;
  name: string;
  packages: PublicTariffPackage[];
};

function formatCountdown(targetDate: string | null, nowTs: number): string {
  if (!targetDate) return '—';
  const targetTs = new Date(targetDate).getTime();
  if (Number.isNaN(targetTs)) return '—';

  const diff = targetTs - nowTs - 1000;
  if (diff <= 0) return '00:00:00';

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return days > 0 ? `${days}д ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export default function PaymentLinkPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = useMemo(() => (typeof params?.slug === 'string' ? params.slug : ''), [params]);
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTariff, setIsLoadingTariff] = useState(true);
  const [tariff, setTariff] = useState<PublicTariff | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const presetName = useMemo(() => searchParams?.get('name')?.trim() ?? '', [searchParams]);
  const presetEmail = useMemo(() => searchParams?.get('email')?.trim() ?? '', [searchParams]);
  const expiresAt = useMemo(() => searchParams?.get('expiresAt')?.trim() ?? null, [searchParams]);
  const paymentLinkId = useMemo(() => searchParams?.get('paymentLinkId')?.trim() ?? '', [searchParams]);
  const syncMarkerKey = useMemo(
    () => (paymentLinkId ? `gelbcrm:payment-in-progress:${paymentLinkId}` : null),
    [paymentLinkId]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const loadTariff = async () => {
      setIsLoadingTariff(true);
      setErrorText(null);

      if (!slug) {
        setTariff(null);
        setErrorText('Ссылка оплаты не найдена или устарела.');
        setIsLoadingTariff(false);
        return;
      }

      const response = await fetch(`/api/v1/public/tariffs/${slug}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as PublicTariff | { message?: string } | null;

      if (!active) return;

      if (!response.ok || !payload || !('id' in payload)) {
        setTariff(null);
        setErrorText((payload && 'message' in payload ? payload.message : null) ?? 'Ссылка оплаты не найдена или устарела.');
        setIsLoadingTariff(false);
        return;
      }

      setTariff(payload);
      setIsLoadingTariff(false);
    };

    void loadTariff();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (presetName && !payerName) {
      setPayerName(presetName);
    }

    if (presetEmail && !payerEmail) {
      setPayerEmail(presetEmail);
    }
  }, [payerEmail, payerName, presetEmail, presetName]);

  useEffect(() => {
    if (!tariff || tariff.packages.length === 0) {
      setSelectedPackageId(null);
      return;
    }

    setSelectedPackageId((prev) => {
      if (prev && tariff.packages.some((item) => item.id === prev)) {
        return prev;
      }

      const preferred = tariff.packages.find((item) => item.lessons_count === 8);
      return (preferred ?? tariff.packages[0]).id;
    });
  }, [tariff]);

  useEffect(() => {
    if (!paymentLinkId || !syncMarkerKey) return;
    if (typeof window === 'undefined') return;
    if (!window.sessionStorage.getItem(syncMarkerKey)) return;

    let cancelled = false;

    const runSync = async () => {
      for (let i = 0; i < 8; i += 1) {
        if (cancelled) return;

        const response = await fetch('/api/v1/payments/reconcile-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ paymentLinkId })
        }).catch(() => null);

        if (!response?.ok) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        const payload = (await response.json().catch(() => null)) as ReconcilePaymentApiResponse | null;
        if (!payload) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        if (payload.status === 'paid' || payload.status === 'failed' || payload.status === 'expired') {
          window.sessionStorage.removeItem(syncMarkerKey);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    };

    void runSync();

    return () => {
      cancelled = true;
    };
  }, [paymentLinkId, syncMarkerKey]);

  const selectedPackage = useMemo(
    () => tariff?.packages.find((item) => item.id === selectedPackageId) ?? null,
    [selectedPackageId, tariff]
  );

  const mostExpensiveLessonPrice = useMemo(
    () => (tariff && tariff.packages.length > 0 ? Math.max(...tariff.packages.map((item) => item.price_per_lesson_rub)) : 0),
    [tariff]
  );
  const isExpired = useMemo(() => {
    if (!expiresAt) return false;
    const targetTs = new Date(expiresAt).getTime();
    if (Number.isNaN(targetTs)) return false;
    return targetTs - nowTs <= 1000;
  }, [expiresAt, nowTs]);

  if (isLoadingTariff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Загрузка</CardTitle>
          <CardDescription>Подготавливаем страницу тарифа...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!tariff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ссылка не найдена</CardTitle>
          <CardDescription>{errorText ?? 'Ссылка оплаты не найдена или устарела.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handlePay = async () => {
    const name = payerName.trim();
    const email = payerEmail.trim();

    if (!name) {
      setErrorText('Введите имя ученика.');
      return;
    }

    if (!email) {
      setErrorText('Введите e-mail ученика.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorText('Введите корректный e-mail.');
      return;
    }

    if (!selectedPackage) {
      setErrorText('Выберите пакет.');
      return;
    }

    if (isExpired) {
      setErrorText('Срок действия ссылки истек. Обратитесь к администратору за новой ссылкой.');
      return;
    }

    setErrorText(null);
    const amount = selectedPackage.total_price_rub;
    setIsSubmitting(true);

    try {
      if (!slug) {
        setErrorText('Ссылка оплаты не найдена или устарела.');
        return;
      }
      const returnUrl = `${window.location.origin}/payment-links/${slug}`;

      const response = await fetch('/api/v1/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          tariffName: tariff.name,
          lessonsCount: selectedPackage.lessons_count,
          payerName: name,
          payerEmail: email,
          returnUrl,
          metadata: {
            tariff_id: tariff.id,
            package_id: selectedPackage.id,
            tariff_grid_id: tariff.id,
            ...(paymentLinkId ? { payment_link_id: paymentLinkId } : {})
          }
        })
      });

      const result = (await response.json().catch(() => null)) as
        | (CreatePaymentApiResponse & { message?: string })
        | null;

      if (!response.ok || !result?.confirmationUrl) {
        setErrorText(result?.message ?? 'Не удалось инициализировать платеж');
        return;
      }

      if (syncMarkerKey && typeof window !== 'undefined') {
        window.sessionStorage.setItem(syncMarkerKey, String(Date.now()));
      }

      window.location.href = result.confirmationUrl;
    } catch {
      setErrorText('Ошибка сети при создании платежа');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {errorText ? (
        <Alert variant="destructive">
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{errorText}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Оплата тарифа: {tariff.name}</CardTitle>
          <CardDescription>Выберите пакет и завершите оплату.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Срок действия ссылки:</span>
            <span className={isExpired ? 'font-semibold text-destructive' : 'font-semibold'}>
              {formatCountdown(expiresAt, nowTs)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Данные ученика</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            placeholder="Имя ученика"
            value={payerName}
            onChange={(event) => setPayerName(event.target.value)}
          />
          <Input
            placeholder="E-mail ученика"
            type="email"
            value={payerEmail}
            onChange={(event) => setPayerEmail(event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Пакеты</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tariff.packages.map((pkg) => {
            const total = pkg.total_price_rub;
            const savings = Math.max(0, (mostExpensiveLessonPrice - pkg.price_per_lesson_rub) * pkg.lessons_count);
            const selected = selectedPackageId === pkg.id;

            return (
              <button
                key={pkg.id}
                type="button"
                className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedPackageId(pkg.id)}
              >
                <span className="font-medium">{pkg.lessons_count} занятий</span>
                <span className="text-sm text-muted-foreground">{formatRub(pkg.price_per_lesson_rub)} за занятие</span>
                <span className="flex items-center gap-2">
                  {savings > 0 ? <Badge>{`Экономия ${formatRub(savings)}`}</Badge> : null}
                  <span className="font-semibold">{formatRub(total)}</span>
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p>
            К оплате:{' '}
            <span className="font-semibold">
              {selectedPackage ? formatRub(selectedPackage.total_price_rub) : 'Выберите пакет'}
            </span>
          </p>
          <Button onClick={handlePay} disabled={isSubmitting || isExpired}>
            {isExpired ? 'Срок действия истек' : isSubmitting ? 'Переходим к оплате...' : 'Перейти к оплате'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
