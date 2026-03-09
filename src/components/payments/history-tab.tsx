'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import { formatDateTime, formatRub } from '@/lib/payments/format';

type PaymentHistoryItem = {
  id: number;
  provider_payment_id: string;
  status: string;
  amount: number;
  currency: string;
  payer_name: string | null;
  payer_email: string | null;
  tariff_name: string | null;
  lessons_count: number | null;
  created_at: string;
  paid_at: string | null;
};

function getStatusTag(status: string) {
  if (status === 'succeeded') {
    return <Tag color="success">Оплачено</Tag>;
  }

  if (status === 'pending') {
    return <Tag color="processing">Ожидает оплату</Tag>;
  }

  if (status === 'canceled') {
    return <Tag color="error">Отменено</Tag>;
  }

  return <Tag>{status}</Tag>;
}

export function PaymentsHistoryTab() {
  const [rows, setRows] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/v1/payments', { cache: 'no-store' });
      const json = (await response.json().catch(() => null)) as PaymentHistoryItem[] | null;

      if (!response.ok || !json) {
        setRows([]);
        return;
      }

      setRows(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <Card>
      <Table<PaymentHistoryItem>
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: 'Платежей пока нет' }}
        columns={[
          {
            title: 'Дата создания',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (value: string) => formatDateTime(value)
          },
          {
            title: 'Ученик',
            dataIndex: 'payer_name',
            key: 'payer_name',
            render: (value: string | null) => value ?? '—'
          },
          {
            title: 'E-mail',
            dataIndex: 'payer_email',
            key: 'payer_email',
            render: (value: string | null) => value ?? '—'
          },
          {
            title: 'Тариф',
            dataIndex: 'tariff_name',
            key: 'tariff_name',
            render: (value: string | null) => value ?? '—'
          },
          {
            title: 'Пакет',
            dataIndex: 'lessons_count',
            key: 'lessons_count',
            render: (value: number | null) => (value ? `${value} занятий` : '—')
          },
          {
            title: 'Сумма',
            dataIndex: 'amount',
            key: 'amount',
            render: (value: number) => formatRub(Number(value))
          },
          {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (value: string) => getStatusTag(value)
          },
          {
            title: 'ID платежа',
            dataIndex: 'provider_payment_id',
            key: 'provider_payment_id'
          }
        ]}
      />
    </Card>
  );
}
