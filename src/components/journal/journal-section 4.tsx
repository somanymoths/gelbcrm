'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
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
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';

type RoleUser = { id: string; role: 'admin' | 'teacher'; login: string };
type TeacherItem = { id: string; full_name: string };
type StudentItem = { id: string; full_name: string; paid_lessons_left: number };
type WeeklySlot = { id: string; weekday: number; start_time: string; is_active: 0 | 1 };
type LessonStatus = 'planned' | 'completed' | 'rescheduled' | 'canceled';
type LessonSlot = {
  id: string;
  student_id: string | null;
  student_full_name: string | null;
  student_paid_lessons_left: number | null;
  date: string;
  start_time: string;
  status: LessonStatus;
  source_weekly_slot_id?: string | null;
};

type DayDraft = {
  time: string;
  studentId: string | null;
  repeatWeekly: boolean;
};

type CreateSlotState = {
  weekday: number;
  date: string;
};

type Notice = {
  type: 'success' | 'error';
  text: string;
};

const DAYS: Array<{ weekday: number; short: string; full: string }> = [
  { weekday: 1, short: 'Пн', full: 'Понедельник' },
  { weekday: 2, short: 'Вт', full: 'Вторник' },
  { weekday: 3, short: 'Ср', full: 'Среда' },
  { weekday: 4, short: 'Чт', full: 'Четверг' },
  { weekday: 5, short: 'Пт', full: 'Пятница' },
  { weekday: 6, short: 'Сб', full: 'Суббота' },
  { weekday: 7, short: 'Вс', full: 'Воскресенье' }
];

const FREE_SLOT_VALUE = '__free_slot__';
const ADMIN_JOURNAL_TEACHER_STORAGE_KEY = 'gelbcrm:journal:selectedTeacherId';
const HOURLY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { value, label: value };
});

export function JournalSection() {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [roleUser, setRoleUser] = useState<RoleUser | null>(null);
  const [teacherProfileMissing, setTeacherProfileMissing] = useState(false);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [weeklyTemplate, setWeeklyTemplate] = useState<WeeklySlot[]>([]);
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [dayDrafts, setDayDrafts] = useState<Record<number, DayDraft>>(() => createInitialDayDrafts());
  const [createSlotState, setCreateSlotState] = useState<CreateSlotState | null>(null);
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [rescheduleState, setRescheduleState] = useState<{ slotId: string; date: string; time: string } | null>(null);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  const showError = useCallback((text: string) => setNotice({ type: 'error', text }), []);
  const showSuccess = useCallback((text: string) => setNotice({ type: 'success', text }), []);

  const weekDays = useMemo(() => {
    return DAYS.map((item, index) => {
      const date = new Date(weekStart.getTime());
      date.setDate(weekStart.getDate() + index);
      return {
        ...item,
        dateIso: toIsoDate(date),
        dateLabel: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      };
    });
  }, [weekStart]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const me = await fetchJson<RoleUser>('/api/v1/auth/me');
      setRoleUser(me);
      setTeacherProfileMissing(false);

      const teacherItems = await fetchJson<TeacherItem[]>('/api/v1/journal/teachers');
      setTeachers(teacherItems);
      const teacherIds = new Set(teacherItems.map((item) => item.id));

      let nextTeacherId = selectedTeacherId;
      if (me.role === 'admin') {
        const persistedTeacherId = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_JOURNAL_TEACHER_STORAGE_KEY) : null;
        if (!nextTeacherId && persistedTeacherId && teacherIds.has(persistedTeacherId)) {
          nextTeacherId = persistedTeacherId;
        }
      }

      if (!nextTeacherId || !teacherIds.has(nextTeacherId)) {
        nextTeacherId = teacherItems[0]?.id ?? null;
      }

      setSelectedTeacherId(nextTeacherId);
      if (!nextTeacherId) {
        setStudents([]);
        setWeeklyTemplate([]);
        setSlots([]);
        return;
      }

      const qs = new URLSearchParams({ teacherId: nextTeacherId });
      const studentsData = await fetchJson<StudentItem[]>(`/api/v1/journal/students?${qs.toString()}`);
      const templateData = await fetchJson<WeeklySlot[]>(`/api/v1/journal/weekly-template?${qs.toString()}`);
      const dateFrom = toIsoDate(weekStart);
      const dateTo = toIsoDate(addDays(weekStart, 6));
      const slotsData = await fetchJson<LessonSlot[]>(
        `/api/v1/journal/slots?teacherId=${encodeURIComponent(nextTeacherId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      );

      setStudents(studentsData);
      setWeeklyTemplate(templateData);
      setSlots(slotsData);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '';
      if (messageText === 'Профиль преподавателя не найден') {
        setTeacherProfileMissing(true);
        setTeachers([]);
        setSelectedTeacherId(null);
        setStudents([]);
        setWeeklyTemplate([]);
        setSlots([]);
        return;
      }
      showError(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [selectedTeacherId, showError, weekStart]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (roleUser?.role !== 'admin' || !selectedTeacherId) return;
    localStorage.setItem(ADMIN_JOURNAL_TEACHER_STORAGE_KEY, selectedTeacherId);
  }, [roleUser?.role, selectedTeacherId]);

  const refreshWeekSlots = useCallback(async (): Promise<LessonSlot[]> => {
    if (!selectedTeacherId) return [];
    const dateFrom = toIsoDate(weekStart);
    const dateTo = toIsoDate(addDays(weekStart, 6));
    const data = await fetchJson<LessonSlot[]>(
      `/api/v1/journal/slots?teacherId=${encodeURIComponent(selectedTeacherId)}&dateFrom=${dateFrom}&dateTo=${dateTo}`
    );
    setSlots(data);
    return data;
  }, [selectedTeacherId, weekStart]);

  const saveTemplate = async (nextTemplate: WeeklySlot[]) => {
    if (!selectedTeacherId) return;
    try {
      await fetchJson(`/api/v1/journal/weekly-template?teacherId=${encodeURIComponent(selectedTeacherId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          slots: nextTemplate.map((slot) => ({
            weekday: slot.weekday,
            startTime: slot.start_time,
            isActive: true
          }))
        })
      });
      setWeeklyTemplate(nextTemplate);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось сохранить шаблон');
      throw error;
    }
  };

  const ensureTemplateSlot = async (weekday: number, startTime: string) => {
    const exists = weeklyTemplate.some((slot) => slot.weekday === weekday && slot.start_time === startTime);
    if (exists) return;
    const nextTemplate: WeeklySlot[] = [
      ...weeklyTemplate,
      { id: `temp-${weekday}-${startTime}`, weekday, start_time: startTime, is_active: 1 }
    ];
    await saveTemplate(nextTemplate);
    await refreshWeekSlots();
  };

  const createSlotForDay = async (weekday: number, date: string): Promise<boolean> => {
    if (!selectedTeacherId) return false;
    const draft = dayDrafts[weekday];
    if (!draft || !draft.time) return false;

    setCreatingSlot(true);
    try {
      if (draft.repeatWeekly) {
        await ensureTemplateSlot(weekday, draft.time);
        const nextSlots = (await refreshWeekSlots()) ?? [];
        const generated = nextSlots.find((slot) => slot.date === date && slot.start_time === draft.time);
        if (generated && draft.studentId) {
          await assignStudent(generated, draft.studentId);
        }
        showSuccess('Еженедельный слот создан');
      } else {
        await fetchJson('/api/v1/journal/slots', {
          method: 'POST',
          body: JSON.stringify({
            teacherId: selectedTeacherId,
            date,
            startTime: draft.time,
            studentId: draft.studentId
          })
        });
        showSuccess('Слот создан');
        await refreshWeekSlots();
      }
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось создать слот');
      return false;
    } finally {
      setCreatingSlot(false);
    }
  };

  const assignStudent = async (slot: LessonSlot, studentId: string | null) => {
    try {
      await fetchJson(`/api/v1/journal/slots/${slot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          studentId
        })
      });
      await refreshWeekSlots();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось назначить ученика');
    }
  };

  const setStatus = async (slot: LessonSlot, status: Exclude<LessonStatus, 'rescheduled'>) => {
    try {
      await fetchJson(`/api/v1/journal/slots/${slot.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          status
        })
      });
      await refreshWeekSlots();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось изменить статус');
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleState) return;
    try {
      await fetchJson(`/api/v1/journal/slots/${rescheduleState.slotId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          status: 'rescheduled',
          rescheduleToDate: rescheduleState.date,
          rescheduleToTime: rescheduleState.time
        })
      });
      setRescheduleState(null);
      await refreshWeekSlots();
      showSuccess('Занятие перенесено');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось перенести занятие');
    }
  };

  const deleteSlot = async (slot: LessonSlot) => {
    if (!selectedTeacherId) return;
    setDeletingSlotId(slot.id);
    try {
      await fetchJson(`/api/v1/journal/slots/${slot.id}?teacherId=${encodeURIComponent(selectedTeacherId)}`, {
        method: 'DELETE'
      });
      await refreshWeekSlots();
      showSuccess('Слот удалён');
    } catch (error) {
      await refreshWeekSlots().catch(() => undefined);
      showError(error instanceof Error ? error.message : 'Не удалось удалить слот');
    } finally {
      setDeletingSlotId((prev) => (prev === slot.id ? null : prev));
    }
  };

  const deleteWeeklySlot = async (slot: LessonSlot) => {
    if (!selectedTeacherId) return;
    if (!slot.source_weekly_slot_id) {
      await deleteSlot(slot);
      return;
    }

    const exists = weeklyTemplate.some((item) => item.id === slot.source_weekly_slot_id);
    if (!exists) {
      await deleteSlot(slot);
      return;
    }

    setDeletingSlotId(slot.id);
    try {
      await fetchJson(
        `/api/v1/journal/slots/${slot.id}?teacherId=${encodeURIComponent(selectedTeacherId)}&deleteMode=series`,
        { method: 'DELETE' }
      );
      setWeeklyTemplate((prev) => prev.filter((item) => item.id !== slot.source_weekly_slot_id));
      await refreshWeekSlots();
      showSuccess('Слоты удалены');
    } catch (error) {
      await refreshWeekSlots().catch(() => undefined);
      showError(error instanceof Error ? error.message : 'Не удалось удалить еженедельный слот');
    } finally {
      setDeletingSlotId((prev) => (prev === slot.id ? null : prev));
    }
  };

  const openDeleteConfirm = (slot: LessonSlot) => {
    const ok = window.confirm('Удалить слот? Действие нельзя отменить.');
    if (!ok) return;
    if (slot.source_weekly_slot_id) {
      void deleteWeeklySlot(slot);
      return;
    }
    void deleteSlot(slot);
  };

  const slotMapByDate = useMemo(() => {
    const map = new Map<string, LessonSlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date)?.push(slot);
    }
    for (const value of map.values()) {
      value.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [slots]);

  const studentOptions = useMemo(
    () => [
      { value: FREE_SLOT_VALUE, label: 'Свободный слот' },
      ...students.map((item) => ({
        value: item.id,
        label: `${item.full_name} (остаток: ${item.paid_lessons_left})`
      }))
    ],
    [students]
  );

  const submitCreateSlot = async () => {
    if (!createSlotState) return;
    const nextState = createSlotState;
    setCreateSlotState(null);
    await createSlotForDay(nextState.weekday, nextState.date);
  };

  if (teacherProfileMissing) {
    return (
      <div className="flex w-full flex-col gap-4">
        <h3 className="text-xl font-semibold">Журнал занятий</h3>
        <Alert variant="destructive">
          <AlertTitle>Профиль преподавателя не назначен</AlertTitle>
          <AlertDescription>
            Обратитесь к администратору для привязки аккаунта к карточке преподавателя.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h3 className="text-xl font-semibold">Журнал занятий</h3>
        <p className="text-sm text-muted-foreground">Еженедельные и разовые слоты, переносы и статусы.</p>
      </div>

      {notice ? (
        <Alert variant={notice.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{notice.type === 'error' ? 'Ошибка' : 'Готово'}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {teachers.length > 0 ? (
          <Select
            value={selectedTeacherId ?? ''}
            onValueChange={setSelectedTeacherId}
            disabled={roleUser?.role !== 'admin'}
          >
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Преподаватель" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          Предыдущая неделя
        </Button>
        <Button variant="secondary" onClick={() => setWeekStart(getWeekStart(new Date()))}>
          Текущая неделя
        </Button>
        <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Следующая неделя
        </Button>
        <Badge variant="outline">{`${toIsoDate(weekStart)} — ${toIsoDate(addDays(weekStart, 6))}`}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {weekDays.map((day) => (
          <Card key={day.dateIso}>
            <CardHeader>
              <CardTitle>{`${day.short}, ${day.dateLabel}`}</CardTitle>
              <CardDescription>{day.full}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={() => setCreateSlotState({ weekday: day.weekday, date: day.dateIso })} disabled={!selectedTeacherId || loading}>
                Добавить слот
              </Button>

              {(slotMapByDate.get(day.dateIso) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{loading ? 'Загрузка...' : 'Нет слотов'}</p>
              ) : (
                (slotMapByDate.get(day.dateIso) ?? []).map((slot) => (
                  <Card key={slot.id}>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{slot.start_time}</Badge>
                        <Badge variant={statusBadgeVariant(slot.status)}>{statusLabel(slot.status)}</Badge>
                        {!slot.source_weekly_slot_id ? <Badge variant="secondary">Разовое занятие</Badge> : null}
                      </div>

                      <Select
                        value={slot.student_id ?? FREE_SLOT_VALUE}
                        onValueChange={(value) => void assignStudent(slot, value === FREE_SLOT_VALUE ? null : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите ученика" />
                        </SelectTrigger>
                        <SelectContent>
                          {studentOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <ButtonGroup>
                        <Button size="xs" onClick={() => void setStatus(slot, 'completed')}>
                          Подтвердть
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-xs" aria-label="Открыть меню действий" disabled={deletingSlotId === slot.id}>
                              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onSelect={() =>
                                setRescheduleState({
                                  slotId: slot.id,
                                  date: slot.date,
                                  time: slot.start_time
                                })
                              }
                            >
                              Перенести
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void setStatus(slot, 'canceled')}>Отменить</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => openDeleteConfirm(slot)}>
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ButtonGroup>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(createSlotState)} onOpenChange={(open) => !open && setCreateSlotState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createSlotState
                ? `Новый слот: ${DAYS.find((item) => item.weekday === createSlotState.weekday)?.full ?? ''}, ${new Date(
                    `${createSlotState.date}T00:00:00`
                  ).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`
                : 'Новый слот'}
            </DialogTitle>
          </DialogHeader>

          {createSlotState ? (
            <div className="flex flex-col gap-3">
              <Select
                value={dayDrafts[createSlotState.weekday]?.time ?? '10:00'}
                onValueChange={(value) =>
                  setDayDrafts((prev) => ({
                    ...prev,
                    [createSlotState.weekday]: {
                      ...(prev[createSlotState.weekday] ?? createDayDraft()),
                      time: value
                    }
                  }))
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURLY_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={dayDrafts[createSlotState.weekday]?.studentId ?? FREE_SLOT_VALUE}
                onValueChange={(value) =>
                  setDayDrafts((prev) => ({
                    ...prev,
                    [createSlotState.weekday]: {
                      ...(prev[createSlotState.weekday] ?? createDayDraft()),
                      studentId: value === FREE_SLOT_VALUE ? null : value
                    }
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ученик (опционально)" />
                </SelectTrigger>
                <SelectContent>
                  {studentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={!(dayDrafts[createSlotState.weekday]?.repeatWeekly ?? true)}
                  onCheckedChange={(checked) => {
                    const isOneTime = Boolean(checked);
                    setDayDrafts((prev) => ({
                      ...prev,
                      [createSlotState.weekday]: {
                        ...(prev[createSlotState.weekday] ?? createDayDraft()),
                        repeatWeekly: !isOneTime
                      }
                    }));
                  }}
                />
                Разовый слот
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateSlotState(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => void submitCreateSlot()}
              disabled={!selectedTeacherId || !createSlotState || !(dayDrafts[createSlotState.weekday]?.time ?? '') || creatingSlot}
            >
              {creatingSlot ? 'Добавляем...' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rescheduleState)} onOpenChange={(open) => !open && setRescheduleState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести занятие</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Input
              type="date"
              value={rescheduleState?.date ?? ''}
              onChange={(event) => setRescheduleState((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
            />

            <Select
              value={rescheduleState?.time ?? '10:00'}
              onValueChange={(value) => setRescheduleState((prev) => (prev ? { ...prev, time: value } : prev))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURLY_TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setRescheduleState(null)}>
              Отмена
            </Button>
            <Button onClick={() => void submitReschedule()}>Сохранить перенос</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function createInitialDayDrafts(): Record<number, DayDraft> {
  const result: Record<number, DayDraft> = {};
  for (const day of DAYS) {
    result[day.weekday] = createDayDraft();
  }
  return result;
}

function createDayDraft(): DayDraft {
  return {
    time: '10:00',
    studentId: null,
    repeatWeekly: true
  };
}

function statusLabel(status: LessonStatus): string {
  if (status === 'completed') return 'Подтверждено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'canceled') return 'Отменено';
  return 'Запланировано';
}

function statusBadgeVariant(status: LessonStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'rescheduled') return 'secondary';
  if (status === 'canceled') return 'destructive';
  return 'outline';
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Запрос завершился с ошибкой');
  }
  return payload as T;
}

function getWeekStart(value: Date): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, amount: number): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  date.setDate(date.getDate() + amount);
  return date;
}
