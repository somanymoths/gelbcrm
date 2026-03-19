'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { EllipsisVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui';
import { formatDateTime, formatRub } from '@/lib/payments/format';

type TariffPackage = {
  id: string;
  tariff_grid_id: string;
  lessons_count: number;
  price_per_lesson_rub: number;
  total_price_rub: number;
  is_active: 0 | 1;
  created_at: string;
};

type TariffGrid = {
  id: string;
  name: string;
  is_active: 0 | 1;
  created_at: string;
  packages: TariffPackage[];
};

type NewPackage = {
  key: string;
  lessonsCount: number;
  pricePerLesson: number;
};

function createEmptyPackage(): NewPackage {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonsCount: 4,
    pricePerLesson: 1000
  };
}

function getPackageTotal(pkg: { lessonsCount: number; pricePerLesson: number }) {
  return pkg.lessonsCount * pkg.pricePerLesson;
}

export function TariffsTab() {
  const [tariffs, setTariffs] = useState<TariffGrid[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [packages, setPackages] = useState<NewPackage[]>([createEmptyPackage()]);

  const [renameTarget, setRenameTarget] = useState<TariffGrid | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const [addPackageTarget, setAddPackageTarget] = useState<TariffGrid | null>(null);
  const [addLessonsCount, setAddLessonsCount] = useState(4);
  const [addPricePerLessonRub, setAddPricePerLessonRub] = useState(1000);
  const [addPackageSubmitting, setAddPackageSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TariffGrid | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canCreate = useMemo(
    () =>
      name.trim().length > 0 &&
      packages.length > 0 &&
      packages.every((item) => item.lessonsCount > 0 && item.pricePerLesson > 0),
    [name, packages]
  );

  const loadTariffs = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/v1/tariff-grids', { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as TariffGrid[] | null;

      if (!response.ok || !data) {
        toast.error('Не удалось загрузить тарифы');
        setTariffs([]);
        return;
      }

      setTariffs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTariffs();
  }, [loadTariffs]);

  const handlePackageChange = (key: string, field: 'lessonsCount' | 'pricePerLesson', value: number) => {
    const normalized = Math.max(0, Number.isFinite(value) ? value : 0);

    setPackages((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: normalized } : item))
    );
  };

  const handleCreateTariff = async () => {
    if (!canCreate) {
      toast.error('Проверьте пакеты: количество занятий и цена должны быть больше 0.');
      return;
    }

    setCreating(true);

    try {
      const response = await fetch('/api/v1/tariff-grids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          packages: packages.map((item) => ({
            lessonsCount: item.lessonsCount,
            pricePerLessonRub: item.pricePerLesson
          }))
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(payload?.message ?? 'Не удалось создать тариф');
        return;
      }

      setName('');
      setPackages([createEmptyPackage()]);
      toast.success('Тариф создан');
      await loadTariffs();
    } finally {
      setCreating(false);
    }
  };

  const openRenameModal = (tariff: TariffGrid) => {
    setRenameTarget(tariff);
    setRenameName(tariff.name);
  };

  const submitRename = async () => {
    if (!renameTarget) return;

    if (!renameName.trim()) {
      toast.error('Введите название тарифа');
      return;
    }

    setRenameSubmitting(true);

    try {
      const response = await fetch(`/api/v1/tariff-grids/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(payload?.message ?? 'Не удалось переименовать тариф');
        return;
      }

      setRenameTarget(null);
      setRenameName('');
      toast.success('Тариф переименован');
      await loadTariffs();
    } finally {
      setRenameSubmitting(false);
    }
  };

  const openAddPackageModal = (tariff: TariffGrid) => {
    setAddPackageTarget(tariff);
    setAddLessonsCount(4);
    setAddPricePerLessonRub(1000);
  };

  const submitAddPackage = async () => {
    if (!addPackageTarget) return;

    if (addLessonsCount <= 0 || addPricePerLessonRub <= 0) {
      toast.error('Количество занятий и цена должны быть больше 0');
      return;
    }

    setAddPackageSubmitting(true);

    try {
      const response = await fetch(`/api/v1/tariff-grids/${addPackageTarget.id}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonsCount: addLessonsCount,
          pricePerLessonRub: addPricePerLessonRub
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(payload?.message ?? 'Не удалось добавить пакет');
        return;
      }

      setAddPackageTarget(null);
      toast.success('Пакет добавлен');
      await loadTariffs();
    } finally {
      setAddPackageSubmitting(false);
    }
  };

  const submitDeleteTariff = async () => {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/v1/tariff-grids/${deleteTarget.id}`, { method: 'DELETE' });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(payload?.message ?? 'Не удалось удалить тариф');
        return;
      }

      toast.success('Тариф удалён');
      setDeleteTarget(null);
      await loadTariffs();
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<ColumnDef<TariffGrid>[]>(
    () => [
      {
        header: 'Тариф',
        accessorKey: 'name'
      },
      {
        header: 'Пакеты',
        id: 'packages',
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.packages.length === 0 ? (
              <span className="text-sm text-muted-foreground">Нет пакетов</span>
            ) : (
              row.original.packages.map((pkg) => (
                <div key={pkg.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {pkg.lessons_count} занятий x {formatRub(pkg.price_per_lesson_rub)} = {formatRub(pkg.total_price_rub)}
                  </span>
                  {pkg.is_active ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Активен</Badge>
                  ) : (
                    <Badge variant="outline">Неактивен</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        )
      },
      {
        header: 'Создан',
        accessorKey: 'created_at',
        cell: ({ row }) => formatDateTime(row.original.created_at)
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          const tariff = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Действия с тарифом">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openRenameModal(tariff)}>Переименовать</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAddPackageModal(tariff)}>Добавить пакет</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(tariff)}>
                  Удалить тариф
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
      }
    ],
    []
  );

  const table = useReactTable({
    data: tariffs,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Новый тариф (серверный)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="new-tariff-name">
              Название тарифа
            </label>
            <Input
              id="new-tariff-name"
              placeholder="Например: Базовый английский"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Пакеты</p>
            <div className="space-y-2">
              {packages.map((pkg, index) => (
                <Card key={pkg.key}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span>Пакет {index + 1}</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={pkg.lessonsCount}
                          onChange={(event) =>
                            handlePackageChange(pkg.key, 'lessonsCount', Number(event.target.value))
                          }
                          className="w-24"
                        />
                        <span className="text-muted-foreground">занятий</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={pkg.pricePerLesson}
                          onChange={(event) =>
                            handlePackageChange(pkg.key, 'pricePerLesson', Number(event.target.value))
                          }
                          className="w-28"
                        />
                        <span className="text-muted-foreground">₽/занятие</span>
                      </div>
                      <span className="font-semibold">{formatRub(getPackageTotal(pkg))}</span>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPackages((prev) => prev.filter((item) => item.key !== pkg.key))}
                      disabled={packages.length === 1}
                    >
                      Удалить
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPackages((prev) => [...prev, createEmptyPackage()])}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить пакет
            </Button>
            <Button onClick={() => void handleCreateTariff()} disabled={!canCreate || creating}>
              {creating ? 'Создаём...' : 'Создать тариф'}
            </Button>
            <Button variant="secondary" onClick={() => void loadTariffs()} disabled={loading}>
              {loading ? 'Обновляем...' : 'Обновить список'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Тарифные сетки</CardTitle>
        </CardHeader>
        <CardContent>
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
                    Пока нет тарифов
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать тариф</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="rename-name">
              Название тарифа
            </label>
            <Input id="rename-name" value={renameName} onChange={(event) => setRenameName(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Отмена
            </Button>
            <Button onClick={() => void submitRename()} disabled={renameSubmitting}>
              {renameSubmitting ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(addPackageTarget)} onOpenChange={(open) => !open && setAddPackageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить пакет{addPackageTarget ? `: ${addPackageTarget.name}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="add-lessons-count">
                Количество занятий
              </label>
              <Input
                id="add-lessons-count"
                type="number"
                min={1}
                value={addLessonsCount}
                onChange={(event) => setAddLessonsCount(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="add-price-per-lesson">
                Цена за занятие (₽)
              </label>
              <Input
                id="add-price-per-lesson"
                type="number"
                min={1}
                value={addPricePerLessonRub}
                onChange={(event) => setAddPricePerLessonRub(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPackageTarget(null)}>
              Отмена
            </Button>
            <Button onClick={() => void submitAddPackage()} disabled={addPackageSubmitting}>
              {addPackageSubmitting ? 'Добавляем...' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить тариф «{deleteTarget?.name ?? ''}»?</DialogTitle>
            <DialogDescription>Тарифная сетка будет удалена без возможности восстановления.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={() => void submitDeleteTariff()} disabled={deleting}>
              {deleting ? 'Удаляем...' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
