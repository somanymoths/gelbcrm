'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea
} from '@/components/ui';

type Scope = 'active' | 'archived';

type Language = {
  id: number;
  name: string;
  flag_emoji: string | null;
};

type Teacher = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  language_id: number | null;
  language_name: string | null;
  language_flag_emoji: string | null;
  rate_rub: number | null;
  telegram_raw: string | null;
  telegram_display: string | null;
  phone: string | null;
  comment: string | null;
  active_students_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type TeacherDetails = Teacher & {
  students: Array<{
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
  }>;
};

type TeachersResponse = {
  items: Teacher[];
  total: number;
  nextOffset: number | null;
};

type SortBy = 'name' | 'students' | 'rate' | 'createdAt';
type SortDir = 'asc' | 'desc';

type TeacherFormValues = {
  firstName: string;
  lastName: string;
  languageId: string;
  rateRub: string;
  telegramRaw: string;
  phone: string;
  comment: string;
};

const PHONE_MASK_REGEX = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;
const FLAG_OPTIONS = ['🇬🇧', '🇩🇪', '🇪🇸', '🇫🇷', '🇮🇹', '🇷🇺', '🇺🇸', '🇵🇹', '🇨🇳', '🇯🇵', '🇰🇷', '🇹🇷'];

function formatPersonName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fallbackFullName?: string | null;
}): string {
  const firstName = input.firstName?.trim() ?? '';
  const lastName = input.lastName?.trim() ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return input.fallbackFullName?.trim() ?? '';
}

function formatPhoneInput(value?: string | null): string {
  const rawDigits = String(value ?? '').replace(/\D/g, '');
  if (!rawDigits) return '';

  let digits = rawDigits;
  if (digits.startsWith('7') || digits.startsWith('8')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (!digits) return '+7';

  let output = '+7';
  if (digits.length > 0) output += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) output += ')';
  if (digits.length > 3) output += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) output += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) output += `-${digits.slice(8, 10)}`;

  return output;
}

function emptyTeacherForm(): TeacherFormValues {
  return {
    firstName: '',
    lastName: '',
    languageId: '',
    rateRub: '',
    telegramRaw: '',
    phone: '',
    comment: ''
  };
}

function toPayload(values: TeacherFormValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    languageId: values.languageId ? Number(values.languageId) : null,
    rateRub: values.rateRub ? Number(values.rateRub) : null,
    telegramRaw: values.telegramRaw.trim() || null,
    phone: values.phone.trim() || null,
    comment: values.comment.trim() || null
  };
}

function validateTeacherForm(values: TeacherFormValues): string | null {
  if (!values.firstName.trim()) return 'Укажите имя';
  if (!values.lastName.trim()) return 'Укажите фамилию';
  if (values.phone.trim() && !PHONE_MASK_REGEX.test(values.phone.trim())) {
    return 'Формат телефона: +7 (999) 999-99-99';
  }
  if (values.comment.length > 1000) return 'Максимум 1000 символов в комментарии';
  if (values.rateRub && Number(values.rateRub) < 0) return 'Ставка не может быть отрицательной';
  return null;
}

export function TeachersSection({ scope }: { scope: Scope }) {
  const [items, setItems] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [languageId, setLanguageId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [languages, setLanguages] = useState<Language[]>([]);
  const [newFilterLanguageName, setNewFilterLanguageName] = useState('');
  const [newFilterLanguageFlag, setNewFilterLanguageFlag] = useState<string>('');
  const [creatingFilterLanguage, setCreatingFilterLanguage] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TeacherDetails | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<TeacherFormValues>(emptyTeacherForm());

  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<TeacherFormValues>(emptyTeacherForm());
  const [submitting, setSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);
  const [dependencies, setDependencies] = useState<TeacherDetails['students']>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const requestSerial = useRef(0);

  const languageOptions = useMemo(
    () =>
      languages.map((lang) => ({
        value: String(lang.id),
        label: `${lang.flag_emoji ? `${lang.flag_emoji} ` : ''}${lang.name}`
      })),
    [languages]
  );

  const fetchLanguages = useCallback(async (): Promise<Language[]> => {
    const response = await fetch('/api/v1/school/languages', { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = (await response.json()) as Language[];
    setLanguages(payload);
    return payload;
  }, []);

  const fetchTeachers = useCallback(
    async (offset: number, append: boolean) => {
      const serial = ++requestSerial.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const query = new URLSearchParams({
        offset: String(offset),
        limit: '30',
        scope,
        sortBy,
        sortDir
      });

      if (search.trim()) query.set('search', search.trim());
      if (languageId) query.set('languageId', String(languageId));

      try {
        const response = await fetch(`/api/v1/teachers?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? 'Не удалось загрузить преподавателей');
        }

        const payload = (await response.json()) as TeachersResponse;
        if (serial !== requestSerial.current) return;

        setItems((prev) => (append ? [...prev, ...payload.items] : payload.items));
        setTotal(payload.total);
        setNextOffset(payload.nextOffset);
      } catch (fetchError) {
        if (serial !== requestSerial.current) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки');
      } finally {
        if (serial === requestSerial.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [languageId, scope, search, sortBy, sortDir]
  );

  useEffect(() => {
    void fetchLanguages();
  }, [fetchLanguages]);

  useEffect(() => {
    void fetchTeachers(0, false);
  }, [fetchTeachers]);

  useEffect(() => {
    if (!detail || !isEditing) return;
    setEditValues({
      firstName: detail.first_name,
      lastName: detail.last_name,
      languageId: detail.language_id ? String(detail.language_id) : '',
      rateRub: detail.rate_rub === null ? '' : String(detail.rate_rub),
      telegramRaw: detail.telegram_raw ?? '',
      phone: formatPhoneInput(detail.phone),
      comment: detail.comment ?? ''
    });
  }, [detail, isEditing]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || nextOffset === null) return;
    await fetchTeachers(nextOffset, true);
  }, [fetchTeachers, loading, loadingMore, nextOffset]);

  const onTableScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 120) void loadMore();
  };

  const openTeacher = useCallback(async (teacherId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setIsEditing(false);

    try {
      const response = await fetch(`/api/v1/teachers/${teacherId}`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось загрузить преподавателя');
      }

      const payload = (await response.json()) as TeacherDetails;
      setDetail(payload);
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function addLanguageFromFilter() {
    const name = newFilterLanguageName.trim();
    if (!name) {
      toast.warning('Введите название языка');
      return;
    }

    setCreatingFilterLanguage(true);
    try {
      const response = await fetch('/api/v1/school/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, flagEmoji: newFilterLanguageFlag || null })
      });

      if (response.status === 409) {
        const refreshed = await fetchLanguages();
        const existing = refreshed.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          setLanguageId(existing.id);
          setNewFilterLanguageName('');
          setNewFilterLanguageFlag(existing.flag_emoji ?? '');
        }
        toast.warning('Такой язык уже существует');
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось добавить язык');
      }

      const created = (await response.json()) as Language;
      setLanguages((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setLanguageId(created.id);
      setNewFilterLanguageName('');
      setNewFilterLanguageFlag(created.flag_emoji ?? '');
      toast.success('Язык добавлен');
    } catch (addError) {
      toast.error(addError instanceof Error ? addError.message : 'Не удалось добавить язык');
    } finally {
      setCreatingFilterLanguage(false);
    }
  }

  async function saveTeacher(id: string) {
    const validationError = validateTeacherForm(editValues);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`/api/v1/teachers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(editValues))
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось сохранить преподавателя');
      }

      const updated = (await response.json()) as TeacherDetails;
      setDetail(updated);
      setIsEditing(false);
      toast.success('Сохранено');
      await fetchTeachers(0, false);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Ошибка сохранения');
    } finally {
      setSubmitting(false);
    }
  }

  async function createTeacher() {
    const validationError = validateTeacherForm(createValues);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch('/api/v1/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(createValues))
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось создать преподавателя');
      }

      setCreateValues(emptyTeacherForm());
      setCreateOpen(false);
      toast.success('Создано');
      await fetchTeachers(0, false);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Ошибка создания');
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveTeacherById(teacherId: string) {
    const response = await fetch(`/api/v1/teachers/${teacherId}/archive`, { method: 'POST' });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Не удалось архивировать преподавателя');
    }

    toast('Преподаватель архивирован', {
      description: 'Можно отменить действие в течение 9 секунд.',
      duration: 9000,
      action: {
        label: 'Undo',
        onClick: () => {
          void restoreTeacherById(teacherId);
        }
      }
    });

    if (detail?.id === teacherId) {
      setDetailOpen(false);
      setDetail(null);
    }

    await fetchTeachers(0, false);
  }

  async function restoreTeacherById(teacherId: string) {
    const response = await fetch(`/api/v1/teachers/${teacherId}/restore`, { method: 'POST' });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Не удалось восстановить преподавателя');
    }

    toast.success('Восстановлен');
    await fetchTeachers(0, false);
  }

  async function openDeleteModal(teacher: Teacher) {
    setDeleteTeacher(teacher);
    setDeleteOpen(true);
    setDependencies([]);
    setSelectedStudentIds([]);
    setDependenciesLoading(true);

    try {
      const response = await fetch(`/api/v1/teachers/${teacher.id}/dependencies`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось загрузить зависимости');
      }

      const payload = (await response.json()) as { students: TeacherDetails['students'] };
      setDependencies(payload.students);
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки зависимостей');
      setDeleteOpen(false);
    } finally {
      setDependenciesLoading(false);
    }
  }

  async function unbindSelected() {
    if (!deleteTeacher || selectedStudentIds.length === 0) return;

    const response = await fetch(`/api/v1/teachers/${deleteTeacher.id}/unbind-students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: selectedStudentIds })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось отвязать учеников');
      return;
    }

    await openDeleteModal(deleteTeacher);
  }

  async function deletePermanently(teacher: Teacher) {
    const response = await fetch(`/api/v1/teachers/${teacher.id}`, { method: 'DELETE' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось удалить преподавателя');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    toast.success('Удалён навсегда');
    await fetchTeachers(0, false);
  }

  async function unbindAllAndDelete(teacher: Teacher) {
    const response = await fetch(`/api/v1/teachers/${teacher.id}/unbind-all-and-delete`, {
      method: 'POST'
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; students?: TeacherDetails['students'] }
        | null;

      setDependencies(payload?.students ?? dependencies);
      setSelectedStudentIds([]);
      toast.error(payload?.message ?? 'Не удалось отвязать всех учеников');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    toast.success('Удалён навсегда');
    await fetchTeachers(0, false);
  }

  const sortMarker = (key: SortBy) => {
    if (sortBy !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const toggleSort = (key: SortBy) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortDir(key === 'createdAt' ? 'desc' : 'asc');
  };

  const columns: ColumnDef<Teacher>[] = [
    {
      id: 'name',
      header: () => (
        <button className="cursor-pointer select-none font-medium" type="button" onClick={() => toggleSort('name')}>
          Имя{sortMarker('name')}
        </button>
      ),
      cell: ({ row }) =>
        formatPersonName({
          firstName: row.original.first_name,
          lastName: row.original.last_name,
          fallbackFullName: row.original.full_name
        })
    },
    {
      id: 'students',
      header: () => (
        <button className="cursor-pointer select-none font-medium" type="button" onClick={() => toggleSort('students')}>
          Ученики{sortMarker('students')}
        </button>
      ),
      cell: ({ row }) => row.original.active_students_count
    },
    {
      id: 'contacts',
      header: 'Контакты',
      cell: ({ row }) => row.original.telegram_display ?? 'Нет контакта'
    },
    {
      id: 'language_name',
      header: 'Язык',
      cell: ({ row }) =>
        row.original.language_name
          ? `${row.original.language_flag_emoji ? `${row.original.language_flag_emoji} ` : ''}${row.original.language_name}`
          : '—'
    },
    {
      id: 'rate',
      header: () => (
        <button className="cursor-pointer select-none font-medium" type="button" onClick={() => toggleSort('rate')}>
          Ставка{sortMarker('rate')}
        </button>
      ),
      cell: ({ row }) => (row.original.rate_rub === null ? '—' : `${row.original.rate_rub} ₽`)
    },
    {
      id: 'menu',
      header: '⋯',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                void openTeacher(row.original.id);
              }}
            >
              Открыть
            </DropdownMenuItem>
            {scope === 'active' ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  void (async () => {
                    try {
                      await archiveTeacherById(row.original.id);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Не удалось архивировать преподавателя');
                    }
                  })();
                }}
              >
                Архивировать
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    void (async () => {
                      try {
                        await restoreTeacherById(row.original.id);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'Не удалось восстановить преподавателя');
                      }
                    })();
                  }}
                >
                  Восстановить
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openDeleteModal(row.original);
                  }}
                >
                  Удалить навсегда
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const detailName = detail
    ? formatPersonName({
        firstName: detail.first_name,
        lastName: detail.last_name,
        fallbackFullName: detail.full_name
      })
    : 'Преподаватель';

  const deleteTitle = deleteTeacher
    ? `Удалить преподавателя: ${formatPersonName({
        firstName: deleteTeacher.first_name,
        lastName: deleteTeacher.last_name,
        fallbackFullName: deleteTeacher.full_name
      })}`
    : 'Удалить преподавателя';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-2xl font-semibold">{scope === 'active' ? 'Преподаватели' : 'Архив преподавателей'}</h2>
          <p className="text-muted-foreground">{scope === 'active' ? 'Активные преподаватели' : 'Архивные преподаватели'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {scope === 'active' ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/teachers/archive">Перейти в архив</Link>
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить преподавателя
              </Button>
            </>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/teachers">К активным</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Поиск</p>
              <Input
                placeholder="Поиск по имени и фамилии"
                className="w-[320px]"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Язык</p>
              <Select
                value={languageId ? String(languageId) : undefined}
                onValueChange={(value) => setLanguageId(value ? Number(value) : null)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Язык" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="secondary">Показано: {items.length} / {total}</Badge>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Новый язык</p>
              <Input
                placeholder="Название"
                value={newFilterLanguageName}
                onChange={(event) => setNewFilterLanguageName(event.target.value)}
                className="w-[220px]"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Флаг</p>
              <Select value={newFilterLanguageFlag || undefined} onValueChange={(value) => setNewFilterLanguageFlag(value)}>
                <SelectTrigger className="w-[88px]">
                  <SelectValue placeholder="🏳️" />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_OPTIONS.map((flag) => (
                    <SelectItem key={flag} value={flag}>
                      {flag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={creatingFilterLanguage} onClick={() => void addLanguageFromFilter()}>
              {creatingFilterLanguage ? 'Добавляем...' : 'Добавить'}
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
              <AlertDescription>
                <Button size="sm" variant="outline" onClick={() => void fetchTeachers(0, false)}>
                  Повторить
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="max-h-[560px] overflow-auto" onScroll={onTableScroll}>
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
                    <TableCell colSpan={columns.length} className="text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-muted-foreground">
                      Нет преподавателей
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => {
                        void openTeacher(row.original.id);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {loadingMore ? <p className="text-sm text-muted-foreground">Загрузка...</p> : null}
        </CardContent>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setDetail(null);
            setIsEditing(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[780px] overflow-auto">
          <DialogHeader>
            <DialogTitle>{detailName}</DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !isEditing ? (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-md border p-3 text-sm">
                <div><span className="font-medium">Имя:</span> {detail.first_name}</div>
                <div><span className="font-medium">Фамилия:</span> {detail.last_name}</div>
                <div>
                  <span className="font-medium">Язык:</span>{' '}
                  {detail.language_name
                    ? `${detail.language_flag_emoji ? `${detail.language_flag_emoji} ` : ''}${detail.language_name}`
                    : '—'}
                </div>
                <div><span className="font-medium">Ставка:</span> {detail.rate_rub === null ? '—' : `${detail.rate_rub} ₽`}</div>
                <div><span className="font-medium">Telegram:</span> {detail.telegram_display ?? '—'}</div>
                <div><span className="font-medium">Телефон:</span> {detail.phone ?? '—'}</div>
                <div><span className="font-medium">Комментарий:</span> {detail.comment ?? '—'}</div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Ученики ({detail.students.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {detail.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет учеников</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.students.map((student) => (
                        <p key={student.id} className="text-sm">
                          {formatPersonName({
                            firstName: student.first_name,
                            lastName: student.last_name,
                            fallbackFullName: student.full_name
                          })}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                {scope === 'active' ? (
                  <>
                    <Button onClick={() => setIsEditing(true)}>Редактировать</Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await archiveTeacherById(detail.id);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Не удалось архивировать преподавателя');
                        }
                      }}
                    >
                      Архивировать
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={async () => {
                        try {
                          await restoreTeacherById(detail.id);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Не удалось восстановить преподавателя');
                        }
                      }}
                    >
                      Восстановить
                    </Button>
                    <Button variant="destructive" onClick={() => void openDeleteModal(detail)}>
                      Удалить навсегда
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Имя</p>
                  <Input value={editValues.firstName} onChange={(event) => setEditValues((prev) => ({ ...prev, firstName: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Фамилия</p>
                  <Input value={editValues.lastName} onChange={(event) => setEditValues((prev) => ({ ...prev, lastName: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Язык</p>
                  <Select value={editValues.languageId || undefined} onValueChange={(value) => setEditValues((prev) => ({ ...prev, languageId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите язык" />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ставка (₽)</p>
                  <Input type="number" min={0} value={editValues.rateRub} onChange={(event) => setEditValues((prev) => ({ ...prev, rateRub: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Telegram</p>
                  <Input
                    placeholder="@username или https://t.me/username"
                    value={editValues.telegramRaw}
                    onChange={(event) => setEditValues((prev) => ({ ...prev, telegramRaw: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Телефон</p>
                  <Input
                    placeholder="+7 (999) 999-99-99"
                    inputMode="numeric"
                    maxLength={18}
                    value={editValues.phone}
                    onChange={(event) =>
                      setEditValues((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Комментарий</p>
                <Textarea
                  rows={4}
                  maxLength={1000}
                  value={editValues.comment}
                  onChange={(event) => setEditValues((prev) => ({ ...prev, comment: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={submitting} onClick={() => void saveTeacher(detail.id)}>
                  {submitting ? 'Сохраняем...' : 'Сохранить'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setEditValues({
                      firstName: detail.first_name,
                      lastName: detail.last_name,
                      languageId: detail.language_id ? String(detail.language_id) : '',
                      rateRub: detail.rate_rub === null ? '' : String(detail.rate_rub),
                      telegramRaw: detail.telegram_raw ?? '',
                      phone: formatPhoneInput(detail.phone),
                      comment: detail.comment ?? ''
                    });
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setCreateValues(emptyTeacherForm());
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить преподавателя</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Имя</p>
                <Input value={createValues.firstName} onChange={(event) => setCreateValues((prev) => ({ ...prev, firstName: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Фамилия</p>
                <Input value={createValues.lastName} onChange={(event) => setCreateValues((prev) => ({ ...prev, lastName: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Язык</p>
                <Select value={createValues.languageId || undefined} onValueChange={(value) => setCreateValues((prev) => ({ ...prev, languageId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите язык" />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Ставка (₽)</p>
                <Input type="number" min={0} value={createValues.rateRub} onChange={(event) => setCreateValues((prev) => ({ ...prev, rateRub: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Telegram</p>
                <Input
                  placeholder="@username или https://t.me/username"
                  value={createValues.telegramRaw}
                  onChange={(event) => setCreateValues((prev) => ({ ...prev, telegramRaw: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Телефон</p>
                <Input
                  placeholder="+7 (999) 999-99-99"
                  inputMode="numeric"
                  maxLength={18}
                  value={createValues.phone}
                  onChange={(event) =>
                    setCreateValues((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Комментарий</p>
              <Textarea
                rows={4}
                maxLength={1000}
                value={createValues.comment}
                onChange={(event) => setCreateValues((prev) => ({ ...prev, comment: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button disabled={submitting} onClick={() => void createTeacher()}>
              {submitting ? 'Создаём...' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false);
            setDeleteTeacher(null);
            setDependencies([]);
            setSelectedStudentIds([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteTitle}</DialogTitle>
          </DialogHeader>

          {dependenciesLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !deleteTeacher ? null : (
            <div className="space-y-3">
              {dependencies.length === 0 ? (
                <>
                  <p className="text-sm">Привязанных учеников нет. Можно удалить преподавателя навсегда.</p>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const ok = window.confirm('Удалить навсегда? Это действие нельзя отменить.');
                      if (!ok) return;
                      void deletePermanently(deleteTeacher);
                    }}
                  >
                    Удалить навсегда
                  </Button>
                </>
              ) : (
                <>
                  <Alert>
                    <AlertTitle>Удаление заблокировано: есть привязанные ученики</AlertTitle>
                    <AlertDescription>Отвяжите выбранных или всех учеников, чтобы продолжить удаление.</AlertDescription>
                  </Alert>

                  <div className="space-y-2 rounded-md border p-3">
                    {dependencies.map((student) => (
                      <label key={student.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={(event) => {
                            setSelectedStudentIds((prev) =>
                              event.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id)
                            );
                          }}
                        />
                        {formatPersonName({
                          firstName: student.first_name,
                          lastName: student.last_name,
                          fallbackFullName: student.full_name
                        })}
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={selectedStudentIds.length === 0} onClick={() => void unbindSelected()}>
                      Отвязать выбранных
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const ok = window.confirm('Отвязать всех и удалить преподавателя навсегда?');
                        if (!ok) return;
                        void unbindAllAndDelete(deleteTeacher);
                      }}
                    >
                      Отвязать всех и удалить
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
