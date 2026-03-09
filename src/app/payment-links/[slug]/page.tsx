'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Empty, Input, Radio, Space, Tag, Typography, message } from 'antd';
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
  const [api, contextHolder] = message.useMessage();

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
        <Empty description="Ссылка оплаты не найдена или устарела" />
      </Card>
    );
  }

  const handlePay = async () => {
    if (!payerName.trim()) {
      api.error('Введите имя ученика.');
      return;
    }

    if (!payerEmail.trim()) {
      api.error('Введите e-mail ученика.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())) {
      api.error('Введите корректный e-mail.');
      return;
    }

    if (!selectedPackage) {
      api.error('Выберите пакет.');
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
        api.error(result?.message ?? 'Не удалось инициализировать платеж');
        return;
      }

      window.location.href = result.confirmationUrl;
    } catch {
      api.error('Ошибка сети при создании платежа');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {contextHolder}

      <Card>
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Оплата тарифа: {tariff.name}
          </Typography.Title>
          <Typography.Text type="secondary">Выберите пакет и завершите оплату.</Typography.Text>
        </Space>
      </Card>

      <Card title="Данные ученика">
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <Input placeholder="Имя ученика" value={payerName} onChange={(event) => setPayerName(event.target.value)} />
          <Input
            placeholder="E-mail ученика"
            type="email"
            value={payerEmail}
            onChange={(event) => setPayerEmail(event.target.value)}
          />
        </Space>
      </Card>

      <Card title="Пакеты">
        <Radio.Group
          value={selectedPackageId}
          onChange={(event) => setSelectedPackageId(event.target.value)}
          style={{ width: '100%' }}
        >
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {tariff.packages.map((pkg) => {
              const total = getPackageTotal(pkg);
              const savings = Math.max(0, (mostExpensiveLessonPrice - pkg.pricePerLesson) * pkg.lessonsCount);

              return (
                <Card key={pkg.id} size="small">
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Radio value={pkg.id}>{`${pkg.lessonsCount} занятий`}</Radio>
                    <Typography.Text>{`${formatRub(pkg.pricePerLesson)} за занятие`}</Typography.Text>
                    <Space size={8}>
                      {savings > 0 ? <Tag color="success">{`Экономия ${formatRub(savings)}`}</Tag> : null}
                      <Typography.Text strong>{formatRub(total)}</Typography.Text>
                    </Space>
                  </Space>
                </Card>
              );
            })}
          </Space>
        </Radio.Group>
      </Card>

      <Card>
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text>
            К оплате:{' '}
            <Typography.Text strong>
              {selectedPackage ? formatRub(getPackageTotal(selectedPackage)) : 'Выберите пакет'}
            </Typography.Text>
          </Typography.Text>
          <Button type="primary" size="large" onClick={handlePay} loading={isSubmitting}>
            Перейти к оплате
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
