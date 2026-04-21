'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const HIDDEN_PAYMENT_IDS = new Set([
  '3140e38a-000f-5000-8000-11aeab562b2f',
  '3140e5a5-000f-5001-9000-10eae9323cf7',
  '3140f0db-000f-5000-b000-196c2a2776b2',
  '3140f565-000f-5000-b000-1507ecf17796',
  '31412eb7-000f-5000-b000-1f9e05697ff7',
  '3141519e-000f-5000-b000-1ba39b11644a',
  '314151ad-000f-5001-8000-1b3528cd2884',
  '3148e2b5-000f-5001-9000-13d57b516539',
  '31497bc1-000f-5001-9000-1fb3265efb84',
  '314b2913-000f-5001-8000-128f717a5308',
  '314b2b59-000f-5000-b000-1b3922d5743d',
  '314b30a8-000f-5000-b000-143e3eca1898',
  '314b3737-000f-5001-8000-113ffe89b291',
  '314b4e6f-000f-5001-9000-18e67ee3af85',
  '31535d81-000f-5000-b000-1ce263dd37d8',
  '3154c447-000f-5001-9000-19389ba766f2',
  'mock-1774367617182',
  '3154c7b3-000f-5001-8000-19af62924c13',
  '3154ca8e-000f-5001-8000-156fce33aaca',
  '3156fa91-000f-5000-b000-13da927c5a42',
  '31613fc1-000f-5001-8000-1acdb3338d08',
  '3161415e-000f-5001-8000-15f6108e29a2',
  '31614323-000f-5001-9000-19cb050ad24f',
  '31614523-000f-5000-8000-12ba916303b8',
  '316f0601-000f-5000-b000-1b7bb2722fe4'
]);

function getStatusBadge(status: string) {
  if (status === 'succeeded' || status === 'paid') {
    return <Badge>Оплачено</Badge>;
  }

  if (status === 'pending') {
    return <Badge variant="secondary">Ожидает оплату</Badge>;
  }

  if (status === 'canceled') {
    return <Badge variant="destructive">Отменено</Badge>;
  }

  return <Badge variant="outline">{status}</Badge>;
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

      setRows(json.filter((row) => !HIDDEN_PAYMENT_IDS.has(row.provider_payment_id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата создания</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Тариф</TableHead>
              <TableHead>Пакет</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>ID платежа</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Загрузка...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Платежей пока нет
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>{row.payer_name ?? '—'}</TableCell>
                  <TableCell>{row.payer_email ?? '—'}</TableCell>
                  <TableCell>{row.tariff_name ?? '—'}</TableCell>
                  <TableCell>{row.lessons_count ? `${row.lessons_count} занятий` : '—'}</TableCell>
                  <TableCell>{formatRub(Number(row.amount))}</TableCell>
                  <TableCell>{getStatusBadge(row.status)}</TableCell>
                  <TableCell>{row.provider_payment_id}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
