'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

type Notice = {
  type: 'success' | 'error';
  text: string;
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
  const [tariffName, setTariffName] = useState('');
  const [tariffs, setTariffs] = useState<TariffGrid[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [packages, setPackages] = useState<NewPackage[]>([createEmptyPackage()]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const canCreate = useMemo(
    () => tariffName.trim().length > 0 && packages.length > 0 && packages.every((item) => item.lessonsCount > 0 && item.pricePerLesson > 0),
    [packages, tariffName]
  );

  const loadTariffs = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/v1/tariff-grids', { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as TariffGrid[] | null;

      if (!response.ok || !data) {
        setNotice({ type: 'error', text: 'Не удалось загрузить тарифы' });
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

  const handlePackageChange = (key: string, field: 'lessonsCount' | 'pricePerLesson', value: string) => {
    const parsed = Math.max(0, Number(value) || 0);
    setPackages((prev) => prev.map((item) => (item.key === key ? { ...item, [field]: parsed } : item)));
  };

  const handleCreateTariff = async () => {
    const trimmedName = tariffName.trim();

    if (!trimmedName || !canCreate) {
      setNotice({ type: 'error', text: 'Проверьте название тарифа и пакеты: все значения должны быть больше 0.' });
      return;
    }

    setCreating(true);

    const response = await fetch('/api/v1/tariff-grids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmedName,
        packages: packages.map((item) => ({
          lessonsCount: item.lessonsCount,
          pricePerLessonRub: item.pricePerLesson
        }))
      })
    });

    setCreating(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: 'error', text: payload?.message ?? 'Не удалось создать тариф' });
      return;
    }

    setPackages([createEmptyPackage()]);
    setTariffName('');
    setNotice({ type: 'success', text: 'Тариф создан' });
    await loadTariffs();
  };

  const renameTariffGrid = async (tariff: TariffGrid) => {
    const name = window.prompt('Новое название тарифа', tariff.name)?.trim();

    if (!name) {
      return;
    }

    const response = await fetch(`/api/v1/tariff-grids/${tariff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: 'error', text: payload?.message ?? 'Не удалось переименовать тариф' });
      return;
    }

    setNotice({ type: 'success', text: 'Тариф переименован' });
    await loadTariffs();
  };

  const addPackageToTariff = async (tariff: TariffGrid) => {
    const lessonsCountRaw = window.prompt('Количество занятий', '4')?.trim();
    if (!lessonsCountRaw) return;

    const pricePerLessonRaw = window.prompt('Цена за занятие (₽)', '1000')?.trim();
    if (!pricePerLessonRaw) return;

    const lessonsCount = Number(lessonsCountRaw);
    const pricePerLessonRub = Number(pricePerLessonRaw);

    if (!Number.isFinite(lessonsCount) || !Number.isFinite(pricePerLessonRub) || lessonsCount < 1 || pricePerLessonRub < 1) {
      setNotice({ type: 'error', text: 'Количество занятий и цена должны быть числами больше 0.' });
      return;
    }

    const response = await fetch(`/api/v1/tariff-grids/${tariff.id}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonsCount, pricePerLessonRub })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: 'error', text: payload?.message ?? 'Не удалось добавить пакет' });
      return;
    }

    setNotice({ type: 'success', text: 'Пакет добавлен' });
    await loadTariffs();
  };

  const deleteTariffGrid = async (tariff: TariffGrid) => {
    if (!window.confirm(`Удалить тариф «${tariff.name}»? Это действие нельзя отменить.`)) {
      return;
    }

    const response = await fetch(`/api/v1/tariff-grids/${tariff.id}`, { method: 'DELETE' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: 'error', text: payload?.message ?? 'Не удалось удалить тариф' });
      return;
    }

    setNotice({ type: 'success', text: 'Тариф удалён' });
    await loadTariffs();
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {notice ? (
        <p className={notice.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-emerald-600'}>{notice.text}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Новый тариф (серверный)</CardTitle>
          <CardDescription>Создайте тариф и добавьте пакеты занятий.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="new-tariff-name" className="text-sm font-medium">
              Название тарифа
            </label>
            <Input
              id="new-tariff-name"
              placeholder="Например: Базовый английский"
              value={tariffName}
              onChange={(event) => setTariffName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Пакеты</p>
            {packages.map((pkg, index) => (
              <Card key={pkg.key}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm">Пакет {index + 1}</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={pkg.lessonsCount}
                        onChange={(event) => handlePackageChange(pkg.key, 'lessonsCount', event.target.value)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">занятий</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={pkg.pricePerLesson}
                        onChange={(event) => handlePackageChange(pkg.key, 'pricePerLesson', event.target.value)}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">₽/занятие</span>
                    </div>
                    <span className="text-sm font-semibold">{formatRub(getPackageTotal(pkg))}</span>
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

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPackages((prev) => [...prev, createEmptyPackage()])}>
              Добавить пакет
            </Button>
            <Button onClick={handleCreateTariff} disabled={!canCreate || creating}>
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
              <TableRow>
                <TableHead>Тариф</TableHead>
                <TableHead>Пакеты</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="w-[72px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : tariffs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Пока нет тарифов
                  </TableCell>
                </TableRow>
              ) : (
                tariffs.map((tariff) => (
                  <TableRow key={tariff.id}>
                    <TableCell>{tariff.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {tariff.packages.length === 0 ? <span className="text-sm text-muted-foreground">Нет пакетов</span> : null}
                        {tariff.packages.map((pkg) => (
                          <div key={pkg.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <span>
                              {pkg.lessons_count} занятий x {formatRub(pkg.price_per_lesson_rub)} = {formatRub(pkg.total_price_rub)}
                            </span>
                            {pkg.is_active ? <Badge>Активен</Badge> : <Badge variant="outline">Неактивен</Badge>}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(tariff.created_at)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Действия с тарифом">
                            ⋯
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void renameTariffGrid(tariff)}>Переименовать</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void addPackageToTariff(tariff)}>Добавить пакет</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => void deleteTariffGrid(tariff)}
                          >
                            Удалить тариф
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
