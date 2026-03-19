'use client';

import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

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
  languageId?: number | null;
  rateRub?: number | null;
  telegramRaw?: string | null;
  phone?: string | null;
  comment?: string | null;
};

type Notice = {
  type: 'success' | 'error' | 'warning';
  text: string;
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
  if (digits.length > 0) {
    output += ` (${digits.slice(0, 3)}`;
  }
  if (digits.length >= 3) {
    output += ')';
  }
  if (digits.length > 3) {
    output += ` ${digits.slice(3, 6)}`;
  }
  if (digits.length > 6) {
    output += `-${digits.slice(6, 8)}`;
  }
  if (digits.length > 8) {
    output += `-${digits.slice(8, 10)}`;
  }

  return output;
}

function emptyTeacherForm(): TeacherFormValues {
  return {
    firstName: '',
    lastName: '',
    languageId: null,
    rateRub: null,
    telegramRaw: '',
    phone: '',
    comment: ''
  };
}

function normalizeTeacherPayload(values: TeacherFormValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    languageId: values.languageId ?? null,
    rateRub: values.rateRub ?? null,
    telegramRaw: values.telegramRaw?.trim() ? values.telegramRaw.trim() : null,
    phone: values.phone?.trim() ? values.phone.trim() : null,
    comment: values.comment?.trim() ? values.comment.trim() : null
  };
}

function validateTeacher(values: TeacherFormValues): string | null {
  if (!values.firstName.trim()) return 'Укажите имя';
  if (!values.lastName.trim()) return 'Укажите фамилию';
  if (values.phone && values.phone.trim() && !PHONE_MASK_REGEX.test(values.phone.trim())) {
    return 'Формат телефона: +7 (999) 999-99-99';
  }
  if ((values.comment ?? '').length > 1000) {
    return 'Максимум 1000 символов в комментарии';
  }
  if ((values.rateRub ?? 0) < 0) {
    return 'Ставка не может быть отрицательной';
  }
  return null;
}

export function TeachersSection({ scope, basePath = '/teachers' }: { scope: Scope; basePath?: string }) {
  const [items, setItems] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [search, setSearch] = useState('');
  const [languageId, setLanguageId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [languages, setLanguages] = useState<Language[]>([]);
  const [newFilterLanguageName, setNewFilterLanguageName] = useState('');
  const [newFilterLanguageFlag, setNewFilterLanguageFlag] = useState<string>('none');
  const [creatingFilterLanguage, setCreatingFilterLanguage] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TeacherDetails | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<TeacherFormValues>(emptyTeacherForm());

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TeacherFormValues>(emptyTeacherForm());
  const [submitting, setSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);
  const [dependencies, setDependencies] = useState<TeacherDetails['students']>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const [undoArchiveTeacherId, setUndoArchiveTeacherId] = useState<string | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const requestSerial = useRef(0);
  const normalizedBasePath = useMemo(() => {
    const trimmed = basePath.trim();
    if (!trimmed) return '/teachers';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }, [basePath]);
  const archivePath = `${normalizedBasePath}/archive`;

  const languageOptions = useMemo(
    () =>
      languages.map((lang) => ({
        value: String(lang.id),
        label: `${lang.flag_emoji ? `${lang.flag_emoji} ` : ''}${lang.name}`
      })),
    [languages]
  );

  const showError = useCallback((text: string) => {
    setNotice({ type: 'error', text });
  }, []);

  const showSuccess = useCallback((text: string) => {
    setNotice({ type: 'success', text });
  }, []);

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

      if (search.trim()) {
        query.set('search', search.trim());
      }

      if (languageId) {
        query.set('languageId', String(languageId));
      }

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
    if (!isEditing || !detail) return;

    setEditForm({
      firstName: detail.first_name,
      lastName: detail.last_name,
      languageId: detail.language_id,
      rateRub: detail.rate_rub,
      telegramRaw: detail.telegram_raw,
      phone: formatPhoneInput(detail.phone),
      comment: detail.comment
    });
  }, [detail, isEditing]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || nextOffset === null) return;
    await fetchTeachers(nextOffset, true);
  }, [fetchTeachers, loading, loadingMore, nextOffset]);

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
      showError(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, [showError]);

  const onTableScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 120) {
      void loadMore();
    }
  };

  function toggleSort(nextSortBy: SortBy) {
    if (sortBy === nextSortBy) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(nextSortBy);
    setSortDir('asc');
  }

  function sortMark(column: Exclude<SortBy, 'createdAt'>): string {
    if (sortBy !== column) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  async function addLanguageFromFilter() {
    const name = newFilterLanguageName.trim();
    if (!name) {
      showError('Введите название языка');
      return;
    }

    setCreatingFilterLanguage(true);
    try {
      const response = await fetch('/api/v1/school/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, flagEmoji: newFilterLanguageFlag === 'none' ? null : newFilterLanguageFlag })
      });

      if (response.status === 409) {
        const refreshed = await fetchLanguages();
        const existing = refreshed.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          setLanguageId(existing.id);
          setNewFilterLanguageName('');
          setNewFilterLanguageFlag(existing.flag_emoji ?? 'none');
        }
        setNotice({ type: 'warning', text: 'Такой язык уже существует' });
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
      setNewFilterLanguageFlag(created.flag_emoji ?? 'none');
      showSuccess('Язык добавлен');
    } catch (addError) {
      showError(addError instanceof Error ? addError.message : 'Не удалось добавить язык');
    } finally {
      setCreatingFilterLanguage(false);
    }
  }

  async function saveTeacher(id: string) {
    const validationError = validateTeacher(editForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`/api/v1/teachers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeTeacherPayload(editForm))
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось сохранить преподавателя');
      }

      const updated = (await response.json()) as TeacherDetails;
      setDetail(updated);
      setIsEditing(false);
      showSuccess('Сохранён');
      await fetchTeachers(0, false);
    } catch (saveError) {
      if (saveError instanceof Error) {
        showError(saveError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function createTeacher() {
    const validationError = validateTeacher(createForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch('/api/v1/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeTeacherPayload(createForm))
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось создать преподавателя');
      }

      setCreateForm(emptyTeacherForm());
      setCreateOpen(false);
      showSuccess('Создан');
      await fetchTeachers(0, false);
    } catch (createError) {
      if (createError instanceof Error) {
        showError(createError.message);
      }
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

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }

    setUndoArchiveTeacherId(teacherId);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoArchiveTeacherId(null);
    }, 9000);

    showSuccess('Преподаватель архивирован. Можно отменить в течение 9 секунд.');

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

    if (undoArchiveTeacherId === teacherId) {
      setUndoArchiveTeacherId(null);
    }

    showSuccess('Восстановлен');
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
      showError(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки зависимостей');
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
      showError(payload?.message ?? 'Не удалось отвязать учеников');
      return;
    }

    await openDeleteModal(deleteTeacher);
  }

  async function deletePermanently(teacher: Teacher) {
    const response = await fetch(`/api/v1/teachers/${teacher.id}`, { method: 'DELETE' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      showError(payload?.message ?? 'Не удалось удалить преподавателя');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    showSuccess('Удалён навсегда');
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
      showError(payload?.message ?? 'Не удалось отвязать всех учеников');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    showSuccess('Удалён навсегда');
    await fetchTeachers(0, false);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{scope === 'active' ? 'Преподаватели' : 'Архив преподавателей'}</h2>
          <p className="text-sm text-muted-foreground">
            {scope === 'active' ? 'Активные преподаватели' : 'Архивные преподаватели'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {scope === 'active' ? (
            <>
              <Link href={archivePath}>
                <Button variant="secondary">Перейти в архив</Button>
              </Link>
              <Button onClick={() => setCreateOpen(true)}>Добавить преподавателя</Button>
            </>
          ) : (
            <Link href={normalizedBasePath}>
              <Button variant="secondary">К активным</Button>
            </Link>
          )}
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{notice.type === 'error' ? 'Ошибка' : notice.type === 'warning' ? 'Внимание' : 'Готово'}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      {undoArchiveTeacherId ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm">Преподаватель архивирован. Можно отменить действие в течение 9 секунд.</p>
            <Button
              variant="outline"
              onClick={() => {
                void restoreTeacherById(undoArchiveTeacherId);
              }}
            >
              Undo
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Список преподавателей</CardTitle>
          <CardDescription>Фильтрация, сортировка и действия по преподавателям.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Поиск по имени и фамилии"
              className="w-[320px]"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <Select
              value={languageId ? String(languageId) : 'all'}
              onValueChange={(value) => setLanguageId(value === 'all' ? null : Number(value))}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Язык" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все языки</SelectItem>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="outline">Показано: {items.length} / {total}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Select value={newFilterLanguageFlag} onValueChange={setNewFilterLanguageFlag}>
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder="🏳️" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без флага</SelectItem>
                {FLAG_OPTIONS.map((flag) => (
                  <SelectItem key={flag} value={flag}>
                    {flag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Новый язык"
              className="w-[220px]"
              value={newFilterLanguageName}
              onChange={(event) => setNewFilterLanguageName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addLanguageFromFilter();
                }
              }}
            />

            <Button variant="secondary" onClick={() => void addLanguageFromFilter()} disabled={creatingFilterLanguage}>
              {creatingFilterLanguage ? 'Добавляем...' : 'Добавить язык'}
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

          <div className="rounded-lg border">
            <div className="max-h-[560px] overflow-y-auto" onScroll={onTableScroll}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>
                      Имя{sortMark('name')}
                    </TableHead>
                    <TableHead className="w-[120px] cursor-pointer" onClick={() => toggleSort('students')}>
                      Ученики{sortMark('students')}
                    </TableHead>
                    <TableHead>Контакты</TableHead>
                    <TableHead className="w-[160px]">Язык</TableHead>
                    <TableHead className="w-[130px] cursor-pointer" onClick={() => toggleSort('rate')}>
                      Ставка{sortMark('rate')}
                    </TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {loading ? 'Загрузка...' : 'Нет преподавателей'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => {
                          void openTeacher(row.id);
                        }}
                      >
                        <TableCell>
                          {formatPersonName({
                            firstName: row.first_name,
                            lastName: row.last_name,
                            fallbackFullName: row.full_name
                          })}
                        </TableCell>
                        <TableCell>{row.active_students_count}</TableCell>
                        <TableCell>{row.telegram_display ?? 'Нет контакта'}</TableCell>
                        <TableCell>
                          {row.language_name ? `${row.language_flag_emoji ? `${row.language_flag_emoji} ` : ''}${row.language_name}` : '—'}
                        </TableCell>
                        <TableCell>{row.rate_rub === null ? '—' : `${row.rate_rub} ₽`}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                                aria-label="Действия"
                              >
                                ⋯
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void openTeacher(row.id);
                                }}
                              >
                                Открыть
                              </DropdownMenuItem>
                              {scope === 'active' ? (
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void archiveTeacherById(row.id).catch((err) => {
                                      showError(err instanceof Error ? err.message : 'Не удалось архивировать преподавателя');
                                    });
                                  }}
                                >
                                  Архивировать
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void restoreTeacherById(row.id).catch((err) => {
                                        showError(err instanceof Error ? err.message : 'Не удалось восстановить преподавателя');
                                      });
                                    }}
                                  >
                                    Восстановить
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openDeleteModal(row);
                                    }}
                                  >
                                    Удалить навсегда
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
            return;
          }
          setDetailOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail
                ? formatPersonName({
                    firstName: detail.first_name,
                    lastName: detail.last_name,
                    fallbackFullName: detail.full_name
                  })
                : 'Преподаватель'}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !isEditing ? (
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="font-medium">Имя:</span> {detail.first_name}</p>
                  <p><span className="font-medium">Фамилия:</span> {detail.last_name}</p>
                  <p>
                    <span className="font-medium">Язык:</span>{' '}
                    {detail.language_name
                      ? `${detail.language_flag_emoji ? `${detail.language_flag_emoji} ` : ''}${detail.language_name}`
                      : '—'}
                  </p>
                  <p><span className="font-medium">Ставка:</span> {detail.rate_rub === null ? '—' : `${detail.rate_rub} ₽`}</p>
                  <p><span className="font-medium">Telegram:</span> {detail.telegram_display ?? '—'}</p>
                  <p><span className="font-medium">Телефон:</span> {detail.phone ?? '—'}</p>
                  <p className="sm:col-span-2"><span className="font-medium">Комментарий:</span> {detail.comment ?? '—'}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ученики ({detail.students.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {detail.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет учеников</p>
                  ) : (
                    <div className="flex flex-col gap-1">
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
                      variant="secondary"
                      onClick={() => {
                        void archiveTeacherById(detail.id).catch((err) => {
                          showError(err instanceof Error ? err.message : 'Не удалось архивировать преподавателя');
                        });
                      }}
                    >
                      Архивировать
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void restoreTeacherById(detail.id).catch((err) => {
                          showError(err instanceof Error ? err.message : 'Не удалось восстановить преподавателя');
                        });
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
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" htmlFor="edit-first-name">Имя</label>
                  <Input
                    id="edit-first-name"
                    value={editForm.firstName}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" htmlFor="edit-last-name">Фамилия</label>
                  <Input
                    id="edit-last-name"
                    value={editForm.lastName}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Язык</label>
                  <Select
                    value={editForm.languageId ? String(editForm.languageId) : 'none'}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, languageId: value === 'none' ? null : Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите язык" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без языка</SelectItem>
                      {languageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" htmlFor="edit-rate">Ставка (₽)</label>
                  <Input
                    id="edit-rate"
                    type="number"
                    min={0}
                    value={editForm.rateRub ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEditForm((prev) => ({ ...prev, rateRub: value === '' ? null : Number(value) }));
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" htmlFor="edit-telegram">Telegram</label>
                  <Input
                    id="edit-telegram"
                    placeholder="@username или https://t.me/username"
                    value={editForm.telegramRaw ?? ''}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, telegramRaw: event.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" htmlFor="edit-phone">Телефон</label>
                  <Input
                    id="edit-phone"
                    placeholder="+7 (999) 999-99-99"
                    inputMode="numeric"
                    maxLength={18}
                    value={editForm.phone ?? ''}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="edit-comment">Комментарий</label>
                <Textarea
                  id="edit-comment"
                  rows={4}
                  maxLength={1000}
                  value={editForm.comment ?? ''}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, comment: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{(editForm.comment ?? '').length}/1000</p>
              </div>

              <DialogFooter>
                <Button disabled={submitting} onClick={() => void saveTeacher(detail.id)}>
                  {submitting ? 'Сохраняем...' : 'Сохранить'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      firstName: detail.first_name,
                      lastName: detail.last_name,
                      languageId: detail.language_id,
                      rateRub: detail.rate_rub,
                      telegramRaw: detail.telegram_raw,
                      phone: detail.phone,
                      comment: detail.comment
                    });
                  }}
                >
                  Отмена
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setCreateForm(emptyTeacherForm());
            return;
          }
          setCreateOpen(true);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить преподавателя</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="create-first-name">Имя</label>
              <Input
                id="create-first-name"
                value={createForm.firstName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="create-last-name">Фамилия</label>
              <Input
                id="create-last-name"
                value={createForm.lastName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Язык</label>
              <Select
                value={createForm.languageId ? String(createForm.languageId) : 'none'}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, languageId: value === 'none' ? null : Number(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите язык" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без языка</SelectItem>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="create-rate">Ставка (₽)</label>
              <Input
                id="create-rate"
                type="number"
                min={0}
                value={createForm.rateRub ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setCreateForm((prev) => ({ ...prev, rateRub: value === '' ? null : Number(value) }));
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="create-telegram">Telegram</label>
              <Input
                id="create-telegram"
                placeholder="@username или https://t.me/username"
                value={createForm.telegramRaw ?? ''}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, telegramRaw: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="create-phone">Телефон</label>
              <Input
                id="create-phone"
                placeholder="+7 (999) 999-99-99"
                inputMode="numeric"
                maxLength={18}
                value={createForm.phone ?? ''}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="create-comment">Комментарий</label>
            <Textarea
              id="create-comment"
              rows={4}
              maxLength={1000}
              value={createForm.comment ?? ''}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, comment: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{(createForm.comment ?? '').length}/1000</p>
          </div>

          <DialogFooter>
            <Button disabled={submitting} onClick={() => void createTeacher()}>
              {submitting ? 'Создаём...' : 'Создать'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setCreateForm(emptyTeacherForm());
              }}
            >
              Отмена
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
            return;
          }
          setDeleteOpen(true);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {deleteTeacher
                ? `Удалить преподавателя: ${formatPersonName({
                    firstName: deleteTeacher.first_name,
                    lastName: deleteTeacher.last_name,
                    fallbackFullName: deleteTeacher.full_name
                  })}`
                : 'Удалить преподавателя'}
            </DialogTitle>
            <DialogDescription>
              Удаление навсегда. Если есть привязанные ученики, сначала нужно отвязать их.
            </DialogDescription>
          </DialogHeader>

          {dependenciesLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : !deleteTeacher ? null : dependencies.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">Привязанных учеников нет. Можно удалить преподавателя навсегда.</p>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!window.confirm('Удалить навсегда? Это действие нельзя отменить.')) return;
                  void deletePermanently(deleteTeacher);
                }}
              >
                Удалить навсегда
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Alert>
                <AlertTitle>Удаление заблокировано</AlertTitle>
                <AlertDescription>
                  Есть привязанные ученики. Отвяжите выбранных или всех учеников, чтобы продолжить удаление.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                {dependencies.map((student) => {
                  const checked = selectedStudentIds.includes(student.id);

                  return (
                    <label key={student.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const isChecked = Boolean(value);
                          setSelectedStudentIds((prev) => {
                            if (isChecked) {
                              return prev.includes(student.id) ? prev : [...prev, student.id];
                            }
                            return prev.filter((id) => id !== student.id);
                          });
                        }}
                      />
                      <span>
                        {formatPersonName({
                          firstName: student.first_name,
                          lastName: student.last_name,
                          fallbackFullName: student.full_name
                        })}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={selectedStudentIds.length === 0} onClick={() => void unbindSelected()}>
                  Отвязать выбранных
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!window.confirm('Отвязать всех и удалить? Это действие нельзя отменить.')) return;
                    void unbindAllAndDelete(deleteTeacher);
                  }}
                >
                  Отвязать всех и удалить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
