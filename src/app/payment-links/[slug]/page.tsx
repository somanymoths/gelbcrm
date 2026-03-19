'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
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
        <CardContent className="py-10 text-center text-muted-foreground">Ссылка оплаты не найдена или устарела</CardContent>
      </Card>
    );
  }

  const handlePay = async () => {
    if (!payerName.trim()) {
      toast.error('Введите имя ученика.');
      return;
    }

    if (!payerEmail.trim()) {
      toast.error('Введите e-mail ученика.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())) {
      toast.error('Введите корректный e-mail.');
      return;
    }

    if (!selectedPackage) {
      toast.error('Выберите пакет.');
      return;
    }

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
          payerName,
          payerEmail,
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
        toast.error(result?.message ?? 'Не удалось инициализировать платеж');
        return;
      }

      window.location.href = result.confirmationUrl;
    } catch {
      toast.error('Ошибка сети при создании платежа');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Оплата тарифа: {tariff.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Выберите пакет и завершите оплату.</p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Данные ученика</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input placeholder="Имя ученика" value={payerName} onChange={(event) => setPayerName(event.target.value)} />
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
          <CardTitle className="text-base">Пакеты</CardTitle>
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
                className={`rounded-lg border p-3 text-left transition ${
                  selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
                onClick={() => setSelectedPackageId(pkg.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{`${pkg.lessonsCount} занятий`}</span>
                    {selected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                  </div>
                  <span className="text-sm text-muted-foreground">{`${formatRub(pkg.pricePerLesson)} за занятие`}</span>
                  <div className="flex items-center gap-2">
                    {savings > 0 ? <Badge variant="secondary">{`Экономия ${formatRub(savings)}`}</Badge> : null}
                    <span className="font-semibold">{formatRub(total)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <p className="text-sm">
            К оплате:{' '}
            <span className="font-semibold">
              {selectedPackage ? formatRub(getPackageTotal(selectedPackage)) : 'Выберите пакет'}
            </span>
          </p>
          <Button size="lg" onClick={handlePay} disabled={isSubmitting}>
            {isSubmitting ? 'Создание платежа...' : 'Перейти к оплате'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
