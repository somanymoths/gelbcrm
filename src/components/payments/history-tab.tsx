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

function getStatusBadge(status: string) {
  if (status === 'succeeded') {
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
