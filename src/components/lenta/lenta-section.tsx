'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type LentaStatus =
  | 'planned'
  | 'overdue'
  | 'completed'
  | 'rescheduled'
  | 'canceled'
  | 'teacher_vacation'
  | 'student_vacation'
  | 'holidays';

type LentaSettings = {
  acquiringPercent: number;
  taxPercent: number;
  fundDevelopmentPercent: number;
  fundSafetyPercent: number;
  fundDividendsPercent: number;
};

type LentaEventItem = {
  id: string;
  eventNumber: number;
  lessonDate: string;
  lessonTime: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  status: LentaStatus;
  statusLabel: string;
  isCompleted: boolean;
  remainingPaidLessons: number | null;
  remainingPaidLessonsPaidAt: string | null;
  lessonPrice: number;
  acquiring: number;
  taxes: number;
  salary: number;
  profit: number;
  development: number;
  safety: number;
  dividends: number;
  yulia: number;
  stas: number;
  rescheduleTargetDate: string | null;
  rescheduleTargetTime: string | null;
  rescheduleSourceDate: string | null;
  rescheduleSourceTime: string | null;
  isOldStudent: boolean;
};

type LentaTotals = {
  completedCount: number;
  lessonPrice: number;
  acquiring: number;
  taxes: number;
  salary: number;
  profit: number;
  development: number;
  safety: number;
  dividends: number;
  yulia: number;
  stas: number;
};

type LentaResponse = {
  items: LentaEventItem[];
  totalCount: number;
  nextOffset: number | null;
  totals: LentaTotals;
  filters: {
    teachers: Array<{ id: string; name: string }>;
    students: Array<{ id: string; name: string }>;
  };
};

type MonthSummary = {
  monthKey: string;
  label: string;
  lessonsCount: number;
  uniqueTeachers: number;
  uniqueStudents: number;
  lessonPrice: number;
  acquiring: number;
  taxes: number;
  salary: number;
  profit: number;
  development: number;
  safety: number;
  dividends: number;
  yulia: number;
  stas: number;
};

const STATUS_OPTIONS: Array<{ value: LentaStatus; label: string }> = [
  { value: 'completed', label: 'Завершено' },
  { value: 'planned', label: 'Запланировано' },
  { value: 'overdue', label: 'Просрочено' },
  { value: 'rescheduled', label: 'Перенесено' },
  { value: 'canceled', label: 'Отменено' },
  { value: 'teacher_vacation', label: 'Отпуск учителя' },
  { value: 'student_vacation', label: 'Отпуск ученика' },
  { value: 'holidays', label: 'Праздники' }
];

const EMPTY_TOTALS: LentaTotals = {
  completedCount: 0,
  lessonPrice: 0,
  acquiring: 0,
  taxes: 0,
  salary: 0,
  profit: 0,
  development: 0,
  safety: 0,
  dividends: 0,
  yulia: 0,
  stas: 0
};

function statusBadgeClass(status: LentaStatus): string {
  if (status === 'teacher_vacation' || status === 'student_vacation' || status === 'holidays') {
    return 'bg-violet-100 text-violet-800 border border-violet-200';
  }
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (status === 'overdue') return 'bg-orange-100 text-orange-800 border border-orange-200';
  if (status === 'rescheduled') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (status === 'canceled') return 'bg-rose-100 text-rose-800 border border-rose-200';
  return 'bg-slate-100 text-slate-800 border border-slate-200';
}

function getMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = now;

  const dateFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  return { dateFrom, dateTo };
}

function formatRuDayMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatReschedulePoint(date: string | null, time: string | null): string {
  if (!date) return '—';
  const dateLabel = formatRuDayMonth(date);
  return time ? `${dateLabel}, ${time}` : dateLabel;
}

function formatRuPackagePaidDate(value: string | null): string {
  if (!value) return '—';
  const isoDate = value.split(' ')[0] ?? value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '—';
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  const monthName = date.toLocaleDateString('ru-RU', { month: 'long' });
  const normalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
  const shortYear = String(date.getFullYear()).slice(-2);
  return `${normalizedMonth}, ${shortYear}`;
}

const MONEY_FORMATTER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

function formatMoney(value: number): string {
  return MONEY_FORMATTER.format(Math.round(value));
}

export function LentaSection() {
  const month = useMemo(() => getMonthRange(), []);

  const [dateFrom, setDateFrom] = useState(month.dateFrom);
  const [dateTo, setDateTo] = useState(month.dateTo);
  const [teacherId, setTeacherId] = useState('all');
  const [studentId, setStudentId] = useState('all');
  const [status, setStatus] = useState('all');

  const [items, setItems] = useState<LentaEventItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [totals, setTotals] = useState<LentaTotals>(EMPTY_TOTALS);
  const [teacherOptions, setTeacherOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [studentOptions, setStudentOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settingsDraft, setSettingsDraft] = useState<LentaSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchRows = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          dateFrom,
          dateTo,
          offset: String(offset),
          limit: '50'
        });

        if (teacherId !== 'all') params.set('teacherId', teacherId);
        if (studentId !== 'all') params.set('studentId', studentId);
        if (status !== 'all') params.set('status', status);

        const response = await fetch(`/api/v1/lenta?${params.toString()}`, { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as LentaResponse | null;

        if (!response.ok || !payload) {
          setError('Не удалось загрузить ленту');
          if (!append) {
            setItems([]);
            setTotalCount(0);
            setTotals(EMPTY_TOTALS);
            setNextOffset(null);
          }
          return;
        }

        setItems((prev) => (append ? [...prev, ...payload.items] : payload.items));
        setTotalCount(payload.totalCount);
        setNextOffset(payload.nextOffset);
        setTotals(payload.totals);
        setTeacherOptions(payload.filters.teachers);
        setStudentOptions(payload.filters.students);
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [dateFrom, dateTo, teacherId, studentId, status]
  );

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);

    try {
      const response = await fetch('/api/v1/lenta/settings', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as LentaSettings | null;
      if (!response.ok || !payload) {
        setSettingsError('Не удалось загрузить настройки');
        return;
      }
      setSettingsDraft(payload);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows(0, false);
  }, [fetchRows]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (nextOffset === null) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (loading || loadingMore) return;
      void fetchRows(nextOffset, true);
    }, {
      rootMargin: '400px'
    });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextOffset, loading, loadingMore, fetchRows]);

  const monthSummaryByKey = useMemo(() => {
    const map = new Map<string, MonthSummary>();

    for (const item of items) {
      const monthKey = getMonthKey(item.lessonDate);
      const current = map.get(monthKey) ?? {
        monthKey,
        label: getMonthLabel(monthKey),
        lessonsCount: 0,
        uniqueTeachers: 0,
        uniqueStudents: 0,
        lessonPrice: 0,
        acquiring: 0,
        taxes: 0,
        salary: 0,
        profit: 0,
        development: 0,
        safety: 0,
        dividends: 0,
        yulia: 0,
        stas: 0
      };

      current.lessonsCount += 1;
      if (item.isCompleted) {
        current.lessonPrice += item.lessonPrice;
        current.acquiring += item.acquiring;
        current.taxes += item.taxes;
        current.salary += item.salary;
        current.profit += item.profit;
        current.development += item.development;
        current.safety += item.safety;
        current.dividends += item.dividends;
        current.yulia += item.yulia;
        current.stas += item.stas;
      }
      map.set(monthKey, current);
    }

    for (const [monthKey, summary] of map.entries()) {
      const monthItems = items.filter((item) => getMonthKey(item.lessonDate) === monthKey);
      summary.uniqueTeachers = new Set(monthItems.map((item) => item.teacherId)).size;
      summary.uniqueStudents = new Set(monthItems.map((item) => item.studentId)).size;
      map.set(monthKey, summary);
    }

    return map;
  }, [items]);

  const groupedRows = useMemo(() => {
    const rows: Array<
      | { type: 'month'; key: string; summary: MonthSummary }
      | { type: 'day'; key: string; label: string }
      | { type: 'item'; item: LentaEventItem }
    > = [];
    let prevMonth = '';
    let prevDate = '';

    for (const item of items) {
      const monthKey = getMonthKey(item.lessonDate);
      if (monthKey !== prevMonth) {
        const summary = monthSummaryByKey.get(monthKey);
        if (summary) {
          rows.push({ type: 'month', key: monthKey, summary });
        }
        prevMonth = monthKey;
      }

      if (item.lessonDate !== prevDate) {
        rows.push({ type: 'day', key: item.lessonDate, label: formatRuDayMonth(item.lessonDate) });
        prevDate = item.lessonDate;
      }
      rows.push({ type: 'item', item });
    }

    return rows;
  }, [items, monthSummaryByKey]);

  const applyFilters = () => {
    setItems([]);
    setNextOffset(0);
    void fetchRows(0, false);
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;

    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(null);

    try {
      const response = await fetch('/api/v1/lenta/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsDraft)
      });
      const payload = (await response.json().catch(() => null)) as LentaSettings | { message?: string } | null;

      if (!response.ok || !payload || !('acquiringPercent' in payload)) {
        const message = payload && 'message' in payload && payload.message ? payload.message : 'Не удалось сохранить настройки';
        setSettingsError(message);
        return;
      }

      setSettingsDraft(payload);
      setSettingsNotice('Настройки сохранены');
      await fetchRows(0, false);
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Лента</h1>
        <p className="text-sm text-muted-foreground">Журнал занятий в хронологическом порядке.</p>
      </div>

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="lenta-date-from">От</label>
            <Input id="lenta-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="lenta-date-to">До</label>
            <Input id="lenta-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Преподаватель</span>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {teacherOptions.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Ученик</span>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {studentOptions.map((student) => (
                  <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Статус</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {STATUS_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-5">
            <Button onClick={applyFilters} disabled={loading}>Применить фильтры</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Итоги периода</CardTitle>
          <CardDescription>В расчет включаются только занятия со статусом «Завершено».</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-6">
          <div><span className="text-muted-foreground">Занятий:</span> {totals.completedCount}</div>
          <div><span className="text-muted-foreground">Стоимость:</span> {formatMoney(totals.lessonPrice)}</div>
          <div><span className="text-muted-foreground">Прибыль:</span> {formatMoney(totals.profit)}</div>
          <div><span className="text-muted-foreground">Развитие:</span> {formatMoney(totals.development)}</div>
          <div><span className="text-muted-foreground">Безопасность:</span> {formatMoney(totals.safety)}</div>
          <div><span className="text-muted-foreground">Дивиденды:</span> {formatMoney(totals.dividends)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Настройки расчета</CardTitle>
          <CardDescription>Проценты эквайринга, налогов и фондов.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          {settingsLoading ? <p className="text-sm text-muted-foreground md:col-span-5">Загрузка настроек...</p> : null}
          {settingsDraft ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Эквайринг, %</label>
                <Input type="number" min={0} max={100} step="0.1" value={settingsDraft.acquiringPercent} onChange={(event) => setSettingsDraft((current) => current ? { ...current, acquiringPercent: Number(event.target.value) } : current)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Налоги, %</label>
                <Input type="number" min={0} max={100} step="0.1" value={settingsDraft.taxPercent} onChange={(event) => setSettingsDraft((current) => current ? { ...current, taxPercent: Number(event.target.value) } : current)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Развитие, %</label>
                <Input type="number" min={0} max={100} step="0.1" value={settingsDraft.fundDevelopmentPercent} onChange={(event) => setSettingsDraft((current) => current ? { ...current, fundDevelopmentPercent: Number(event.target.value) } : current)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Безопасность, %</label>
                <Input type="number" min={0} max={100} step="0.1" value={settingsDraft.fundSafetyPercent} onChange={(event) => setSettingsDraft((current) => current ? { ...current, fundSafetyPercent: Number(event.target.value) } : current)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Дивиденды, %</label>
                <Input type="number" min={0} max={100} step="0.1" value={settingsDraft.fundDividendsPercent} onChange={(event) => setSettingsDraft((current) => current ? { ...current, fundDividendsPercent: Number(event.target.value) } : current)} />
              </div>
              <div className="md:col-span-5">
                <Button onClick={() => void saveSettings()} disabled={settingsSaving}>{settingsSaving ? 'Сохранение...' : 'Сохранить настройки'}</Button>
                {settingsError ? <p className="mt-2 text-sm text-destructive">{settingsError}</p> : null}
                {settingsNotice ? <p className="mt-2 text-sm text-emerald-600">{settingsNotice}</p> : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Таблица событий</CardTitle>
          <CardDescription>Всего событий: {totalCount}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="lenta-sticky-table">
          <Table>
            <TableHeader className="sticky top-0 z-30 bg-background">
              <TableRow>
                <TableHead className="sticky top-0 z-30 bg-background">#</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Занятия</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Преподаватель</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Ученик</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Стоимость</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Эквайринг</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Налоги</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Зарплата</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Прибыль</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Раз.</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Без.</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Див.</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Юля</TableHead>
                <TableHead className="sticky top-0 z-30 bg-background">Стас</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground">Загрузка...</TableCell>
                </TableRow>
              ) : groupedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground">Событий не найдено</TableCell>
                </TableRow>
              ) : (
                groupedRows.map((row) => {
                  if (row.type === 'month') {
                    const month = row.summary;
                    return (
                      <TableRow key={`month-${row.key}`} className="bg-blue-50/70 font-medium">
                        <TableCell>{month.lessonsCount}</TableCell>
                        <TableCell>{month.label}</TableCell>
                        <TableCell>{month.uniqueTeachers}</TableCell>
                        <TableCell>{month.uniqueStudents}</TableCell>
                        <TableCell>{formatMoney(month.lessonPrice)}</TableCell>
                        <TableCell>{formatMoney(month.acquiring)}</TableCell>
                        <TableCell>{formatMoney(month.taxes)}</TableCell>
                        <TableCell>{formatMoney(month.salary)}</TableCell>
                        <TableCell>{formatMoney(month.profit)}</TableCell>
                        <TableCell>{formatMoney(month.development)}</TableCell>
                        <TableCell>{formatMoney(month.safety)}</TableCell>
                        <TableCell>{formatMoney(month.dividends)}</TableCell>
                        <TableCell>{formatMoney(month.yulia)}</TableCell>
                        <TableCell>{formatMoney(month.stas)}</TableCell>
                      </TableRow>
                    );
                  }

                  if (row.type === 'day') {
                    return (
                      <TableRow key={`day-${row.key}`} className="bg-muted/60">
                        <TableCell colSpan={14} className="font-medium">{row.label}</TableCell>
                      </TableRow>
                    );
                  }

                  const item = row.item;
                  const rowClass = item.isCompleted ? '' : 'bg-muted/35 text-muted-foreground';

                  return (
                    <TableRow key={item.id} className={rowClass}>
                      <TableCell>{item.eventNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.lessonTime}</Badge>
                          {item.status === 'rescheduled' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className={`${statusBadgeClass(item.status)} inline-flex w-[132px] justify-center`}>{item.statusLabel}</Badge>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                  <div className="flex flex-col gap-1">
                                    <span>{`Откуда: ${formatReschedulePoint(item.lessonDate, item.lessonTime)}`}</span>
                                    <span>{`Куда: ${formatReschedulePoint(item.rescheduleTargetDate, item.rescheduleTargetTime)}`}</span>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge className={`${statusBadgeClass(item.status)} inline-flex w-[132px] justify-center`}>{item.statusLabel}</Badge>
                          )}
                          {item.remainingPaidLessons === null ? (
                            <Badge variant="outline">—</Badge>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline">{item.remainingPaidLessons}</Badge>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                  <span>{`Дата оплаты: ${formatRuPackagePaidDate(item.remainingPaidLessonsPaidAt)}`}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{item.teacherName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{item.studentName}</span>
                          {item.isOldStudent ? <Badge variant="outline">олд</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(item.lessonPrice)}</TableCell>
                      <TableCell>{formatMoney(item.acquiring)}</TableCell>
                      <TableCell>{formatMoney(item.taxes)}</TableCell>
                      <TableCell>{formatMoney(item.salary)}</TableCell>
                      <TableCell>{formatMoney(item.profit)}</TableCell>
                      <TableCell>{formatMoney(item.development)}</TableCell>
                      <TableCell>{formatMoney(item.safety)}</TableCell>
                      <TableCell>{formatMoney(item.dividends)}</TableCell>
                      <TableCell>{formatMoney(item.yulia)}</TableCell>
                      <TableCell>{formatMoney(item.stas)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>

          <style jsx global>{`
            .lenta-sticky-table [data-slot='table-container'] {
              overflow: visible !important;
            }
          `}</style>

          <div ref={sentinelRef} className="h-10" />

          {loadingMore ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
              Загрузка ещё 50 строк...
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
