'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRub } from '@/lib/payments/format';
import { getPackageTotal, getTariffBySlug } from '@/lib/payments/store';

type CreatePaymentApiResponse = {
  paymentId: string;
  status: string;
  paid: boolean;
  confirmationUrl: string;
};

export default function PaymentLinkPage() {
  const params = useParams<{ slug: string }>();
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const tariff = useMemo(() => getTariffBySlug(params.slug), [params.slug]);

  const selectedPackage = useMemo(
    () => tariff?.packages.find((item) => item.id === selectedPackageId) ?? null,
    [selectedPackageId, tariff]
  );

  const mostExpensiveLessonPrice = useMemo(
    () => (tariff ? Math.max(...tariff.packages.map((item) => item.pricePerLesson)) : 0),
    [tariff]
  );

  if (!tariff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ссылка не найдена</CardTitle>
          <CardDescription>Ссылка оплаты не найдена или устарела.</CardDescription>
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

    setErrorText(null);
    const amount = getPackageTotal(selectedPackage);
    setIsSubmitting(true);

    try {
      const returnUrl = `${window.location.origin}/payment-links/${params.slug}`;

      const response = await fetch('/api/v1/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          tariffName: tariff.name,
          lessonsCount: selectedPackage.lessonsCount,
          payerName: name,
          payerEmail: email,
          returnUrl,
          metadata: {
            tariff_id: tariff.id,
            package_id: selectedPackage.id,
            slug: params.slug
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
            const total = getPackageTotal(pkg);
            const savings = Math.max(0, (mostExpensiveLessonPrice - pkg.pricePerLesson) * pkg.lessonsCount);
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
                <span className="font-medium">{pkg.lessonsCount} занятий</span>
                <span className="text-sm text-muted-foreground">{formatRub(pkg.pricePerLesson)} за занятие</span>
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
              {selectedPackage ? formatRub(getPackageTotal(selectedPackage)) : 'Выберите пакет'}
            </span>
          </p>
          <Button onClick={handlePay} disabled={isSubmitting}>
            {isSubmitting ? 'Переходим к оплате...' : 'Перейти к оплате'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
