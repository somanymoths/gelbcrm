'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Badge, Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
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
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Оплачено</Badge>;
  }

  if (status === 'pending') {
    return <Badge className="bg-sky-600 text-white hover:bg-sky-600">Ожидает оплату</Badge>;
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

  const columns = useMemo<ColumnDef<PaymentHistoryItem>[]>(
    () => [
      {
        header: 'Дата создания',
        accessorKey: 'created_at',
        cell: ({ row }) => formatDateTime(row.original.created_at)
      },
      {
        header: 'Ученик',
        accessorKey: 'payer_name',
        cell: ({ row }) => row.original.payer_name ?? '—'
      },
      {
        header: 'E-mail',
        accessorKey: 'payer_email',
        cell: ({ row }) => row.original.payer_email ?? '—'
      },
      {
        header: 'Тариф',
        accessorKey: 'tariff_name',
        cell: ({ row }) => row.original.tariff_name ?? '—'
      },
      {
        header: 'Пакет',
        accessorKey: 'lessons_count',
        cell: ({ row }) => (row.original.lessons_count ? `${row.original.lessons_count} занятий` : '—')
      },
      {
        header: 'Сумма',
        accessorKey: 'amount',
        cell: ({ row }) => formatRub(Number(row.original.amount))
      },
      {
        header: 'Статус',
        accessorKey: 'status',
        cell: ({ row }) => getStatusBadge(row.original.status)
      },
      {
        header: 'ID платежа',
        accessorKey: 'provider_payment_id'
      }
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Загрузка...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Платежей пока нет
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
