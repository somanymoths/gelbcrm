'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, CalendarDays, CircleArrowRight, CircleX, Ellipsis, Loader, Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar as UIAvatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getStableAvatarColor, getStableAvatarInitial, getStableAvatarSeed } from '@/lib/avatar-color';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { calculateForecastBySlotId } from '@/lib/journal-forecast';
import { toast } from 'sonner';

type RoleUser = { id: string; role: 'admin' | 'teacher'; login: string };
type TeacherItem = { id: string; full_name: string };
type StudentItem = { id: string; full_name: string; paid_lessons_left: number };
type WeeklySlot = {
  id: string;
  weekday: number;
  start_time: string;
  start_from: string | null;
  is_active: 0 | 1;
  student_id?: string | null;
};
type LessonStatus = 'planned' | 'overdue' | 'completed' | 'rescheduled' | 'canceled';
type LessonSlot = {
  id: string;
  student_id: string | null;
  student_full_name: string | null;
  student_paid_lessons_left: number | null;
  date: string;
  start_time: string;
  status: LessonStatus;
  rescheduled_to_slot_id: string | null;
  reschedule_target_date: string | null;
  reschedule_target_time: string | null;
  lock_version: number;
  status_changed_by_login: string | null;
  status_changed_at: string | null;
  status_reason?: string | null;
  source_weekly_slot_id?: string | null;
};
type PlannedForecastBaseline = { student_id: string; planned_count: number };
type WeekSlotsResponse = { slots: LessonSlot[]; baseline: PlannedForecastBaseline[] };

type DayDraft = {
  time: string;
  startFrom: string | null;
  studentId: string | null;
  repeatWeekly: boolean;
};

type CreateSlotState = {
  mode: 'create' | 'edit';
  slotId?: string;
  weekday: number;
  date: string;
};

type RescheduleState = {
  slotId: string;
  date: string;
  time: string;
  reason: string;
  forbiddenSourceDate?: string;
  forbiddenSourceTime?: string;
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
const JOURNAL_WEEK_START_STORAGE_KEY = 'gelbcrm:journal:weekStart';
const JOURNAL_MIN_WEEK_START_ISO = '2025-12-29';
const REFERENCE_CACHE_TTL_MS = 60_000;
const HOURLY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { value, label: value };
});
const RESCHEDULE_REASONS = ['По причине ученика', 'По причине учителя'] as const;

export function JournalSection() {
  const [loading, setLoading] = useState(false);
  const [roleUser, setRoleUser] = useState<RoleUser | null>(null);
  const [teacherProfileMissing, setTeacherProfileMissing] = useState(false);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [weeklyTemplate, setWeeklyTemplate] = useState<WeeklySlot[]>([]);
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [plannedBaselineByStudentId, setPlannedBaselineByStudentId] = useState<Record<string, number>>({});
  const [weekStart, setWeekStart] = useState(() => clampWeekStart(getWeekStart(new Date())));
  const [weekStartHydrated, setWeekStartHydrated] = useState(false);
  const [dayDrafts, setDayDrafts] = useState<Record<number, DayDraft>>(() => createInitialDayDrafts());
  const [createSlotState, setCreateSlotState] = useState<CreateSlotState | null>(null);
  const [templateSlotState, setTemplateSlotState] = useState<{ weekday: number; slotId?: string } | null>(null);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [rescheduleState, setRescheduleState] = useState<RescheduleState | null>(null);
  const [cancelState, setCancelState] = useState<{ slotId: string; reason: string } | null>(null);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [editingStudentSlotId, setEditingStudentSlotId] = useState<string | null>(null);
  const [slotStudentDrafts, setSlotStudentDrafts] = useState<Record<string, string>>({});
  const [assigningStudentSlotId, setAssigningStudentSlotId] = useState<string | null>(null);
  const [statusUpdatingSlotId, setStatusUpdatingSlotId] = useState<string | null>(null);
  const [confirmUpdatingSlotId, setConfirmUpdatingSlotId] = useState<string | null>(null);
  const studentsCacheRef = useRef<Map<string, { ts: number; data: StudentItem[] }>>(new Map());
  const weeklyTemplateCacheRef = useRef<Map<string, { ts: number; data: WeeklySlot[] }>>(new Map());
  const roleUserCacheRef = useRef<{ ts: number; data: RoleUser } | null>(null);
  const teachersCacheRef = useRef<{ ts: number; data: TeacherItem[] } | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const softRefreshTimerRef = useRef<number | null>(null);
  const weekColumnsScrollRef = useRef<HTMLDivElement | null>(null);
  const dragScrollStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    dragging: boolean;
  } | null>(null);
  const [isDraggingColumns, setIsDraggingColumns] = useState(false);

  const showError = useCallback((text: string) => {
    toast.error('Ошибка', { description: text });
  }, []);

  const stopColumnsDrag = useCallback(() => {
    if (!dragScrollStateRef.current?.dragging) return;
    dragScrollStateRef.current = null;
    setIsDraggingColumns(false);
    document.body.style.userSelect = '';
  }, []);

  const handleColumnsMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        'button, a, input, select, textarea, label, [role="button"], [data-slot="toggle"], [data-radix-select-trigger], [data-journal-day-column], [data-journal-slot-card]'
      )
    ) {
      return;
    }

    const container = weekColumnsScrollRef.current;
    if (!container) return;

    dragScrollStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      dragging: true
    };
    setIsDraggingColumns(true);
    document.body.style.userSelect = 'none';
  }, []);

  const handleColumnsMouseMove = useCallback((event: MouseEvent) => {
    const state = dragScrollStateRef.current;
    const container = weekColumnsScrollRef.current;
    if (!state?.dragging || !container) return;
    event.preventDefault();
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    container.scrollLeft = state.scrollLeft - deltaX;
    container.scrollTop = state.scrollTop - deltaY;
  }, []);
  const showSuccess = useCallback((text: string) => {
    toast.success('Готово', { description: text });
  }, []);
  const isAdminConflictError = useCallback((error: unknown): boolean => {
    return error instanceof Error && error.message.includes('Занятие уже изменено администратором');
  }, []);

  const applyStudentBalanceDelta = useCallback((studentId: string | null, delta: number) => {
    if (!studentId || delta === 0) return;
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? { ...student, paid_lessons_left: Math.max(0, student.paid_lessons_left + delta) }
          : student
      )
    );
    if (selectedTeacherId) {
      const cached = studentsCacheRef.current.get(selectedTeacherId);
      if (cached) {
        studentsCacheRef.current.set(selectedTeacherId, {
          ts: Date.now(),
          data: cached.data.map((student) =>
            student.id === studentId
              ? { ...student, paid_lessons_left: Math.max(0, student.paid_lessons_left + delta) }
              : student
          )
        });
      }
    }
  }, [selectedTeacherId]);

  const syncStudentBalanceFromSlot = useCallback(
    (slot: LessonSlot) => {
      if (!slot.student_id || slot.student_paid_lessons_left === null) return;
      const nextBalance = Math.max(0, Number(slot.student_paid_lessons_left));

      setStudents((prev) =>
        prev.map((student) => (student.id === slot.student_id ? { ...student, paid_lessons_left: nextBalance } : student))
      );

      if (selectedTeacherId) {
        const cached = studentsCacheRef.current.get(selectedTeacherId);
        if (cached) {
          studentsCacheRef.current.set(selectedTeacherId, {
            ts: Date.now(),
            data: cached.data.map((student) =>
              student.id === slot.student_id ? { ...student, paid_lessons_left: nextBalance } : student
            )
          });
        }
      }
    },
    [selectedTeacherId]
  );

  const upsertSlotInState = useCallback((slot: LessonSlot) => {
    setSlots((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.id === slot.id);
      if (index >= 0) {
        next[index] = slot;
      } else {
        next.push(slot);
      }
      return next.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.start_time.localeCompare(b.start_time);
      });
    });
  }, []);

  const removeSlotFromState = useCallback((slotId: string) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  }, []);

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

  const canGoToPreviousWeek = useMemo(() => {
    return toIsoDate(weekStart) > JOURNAL_MIN_WEEK_START_ISO;
  }, [weekStart]);

  const isCurrentWeekSelected = useMemo(() => {
    return toIsoDate(weekStart) === toIsoDate(clampWeekStart(getWeekStart(new Date())));
  }, [weekStart]);

  const weekRangeLabel = useMemo(() => {
    const weekEnd = addDays(weekStart, 6);
    const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
    return `${formatter.format(weekStart)} — ${formatter.format(weekEnd)}`;
  }, [weekStart]);

  const refreshWeekData = useCallback(async (teacherId: string, options?: { syncRange?: boolean; signal?: AbortSignal }) => {
    const dateFrom = toIsoDate(weekStart);
    const dateTo = toIsoDate(addDays(weekStart, 6));

    if (options?.syncRange) {
      await fetchJson(
        '/api/v1/journal/slots/sync-range',
        withIdempotencyHeaders({
          method: 'POST',
          signal: options.signal,
          body: JSON.stringify({ teacherId, dateFrom, dateTo })
        })
      );
    }

    const payload = await fetchJson<WeekSlotsResponse>(
      `/api/v1/journal/slots?teacherId=${encodeURIComponent(teacherId)}&dateFrom=${dateFrom}&dateTo=${dateTo}&includeBaseline=1`,
      { signal: options?.signal }
    );

    setSlots(payload.slots);
    setPlannedBaselineByStudentId(
      Object.fromEntries(payload.baseline.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))]))
    );
  }, [weekStart]);

  const scheduleSoftRefresh = useCallback((teacherId?: string | null) => {
    const targetTeacherId = teacherId ?? selectedTeacherId;
    if (!targetTeacherId) return;
    if (softRefreshTimerRef.current) {
      window.clearTimeout(softRefreshTimerRef.current);
    }
    softRefreshTimerRef.current = window.setTimeout(() => {
      void refreshWeekData(targetTeacherId, { syncRange: false });
    }, 250);
  }, [refreshWeekData, selectedTeacherId]);

  const loadAll = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    try {
      const now = Date.now();
      const me =
        roleUserCacheRef.current && now - roleUserCacheRef.current.ts <= REFERENCE_CACHE_TTL_MS
          ? roleUserCacheRef.current.data
          : await fetchJson<RoleUser>('/api/v1/auth/me');
      roleUserCacheRef.current = { ts: now, data: me };
      setRoleUser(me);
      setTeacherProfileMissing(false);

      const teacherItems =
        teachersCacheRef.current && now - teachersCacheRef.current.ts <= REFERENCE_CACHE_TTL_MS
          ? teachersCacheRef.current.data
          : await fetchJson<TeacherItem[]>('/api/v1/journal/teachers');
      teachersCacheRef.current = { ts: now, data: teacherItems };
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
        setPlannedBaselineByStudentId({});
        return;
      }

      const qs = new URLSearchParams({ teacherId: nextTeacherId });
      const studentsCached = studentsCacheRef.current.get(nextTeacherId);
      const templateCached = weeklyTemplateCacheRef.current.get(nextTeacherId);
      const shouldFetchStudents = !studentsCached || now - studentsCached.ts > REFERENCE_CACHE_TTL_MS;
      const shouldFetchTemplate = !templateCached || now - templateCached.ts > REFERENCE_CACHE_TTL_MS;

      let studentsData: StudentItem[];
      if (shouldFetchStudents) {
        studentsData = await fetchJson<StudentItem[]>(`/api/v1/journal/students?${qs.toString()}`);
        studentsCacheRef.current.set(nextTeacherId, { ts: now, data: studentsData });
      } else {
        studentsData = studentsCached.data;
      }

      let templateData: WeeklySlot[];
      if (shouldFetchTemplate) {
        templateData = await fetchJson<WeeklySlot[]>(`/api/v1/journal/weekly-template?${qs.toString()}`);
        weeklyTemplateCacheRef.current.set(nextTeacherId, { ts: now, data: templateData });
      } else {
        templateData = templateCached.data;
      }
      const dateFrom = toIsoDate(weekStart);
      const dateTo = toIsoDate(addDays(weekStart, 6));
      const [slotsPayload] = await Promise.all([
        (async () => {
          await fetchJson(
            '/api/v1/journal/slots/sync-range',
            withIdempotencyHeaders({
              method: 'POST',
              signal: controller.signal,
              body: JSON.stringify({ teacherId: nextTeacherId, dateFrom, dateTo })
            })
          );
          return fetchJson<WeekSlotsResponse>(
            `/api/v1/journal/slots?teacherId=${encodeURIComponent(nextTeacherId)}&dateFrom=${dateFrom}&dateTo=${dateTo}&includeBaseline=1`,
            { signal: controller.signal }
          );
        })()
      ]);

      setStudents(studentsData);
      setWeeklyTemplate(templateData);
      setSlots(slotsPayload.slots);
      setPlannedBaselineByStudentId(
        Object.fromEntries(slotsPayload.baseline.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))]))
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const messageText = error instanceof Error ? error.message : '';
      if (messageText === 'Профиль преподавателя не найден') {
        setTeacherProfileMissing(true);
        setTeachers([]);
        setSelectedTeacherId(null);
        setStudents([]);
        setWeeklyTemplate([]);
        setSlots([]);
        setPlannedBaselineByStudentId({});
        return;
      }
      showError(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [selectedTeacherId, showError, weekStart]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      if (softRefreshTimerRef.current) {
        window.clearTimeout(softRefreshTimerRef.current);
      }
      document.body.style.userSelect = '';
    };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleColumnsMouseMove);
    window.addEventListener('mouseup', stopColumnsDrag);
    return () => {
      window.removeEventListener('mousemove', handleColumnsMouseMove);
      window.removeEventListener('mouseup', stopColumnsDrag);
    };
  }, [handleColumnsMouseMove, stopColumnsDrag]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persisted = localStorage.getItem(JOURNAL_WEEK_START_STORAGE_KEY);
    const parsed = parseIsoDateToDate(persisted);
    if (parsed) {
      setWeekStart(clampWeekStart(getWeekStart(parsed)));
    }
    setWeekStartHydrated(true);
  }, []);

  useEffect(() => {
    if (roleUser?.role !== 'admin' || !selectedTeacherId) return;
    localStorage.setItem(ADMIN_JOURNAL_TEACHER_STORAGE_KEY, selectedTeacherId);
  }, [roleUser?.role, selectedTeacherId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !weekStartHydrated) return;
    localStorage.setItem(JOURNAL_WEEK_START_STORAGE_KEY, toIsoDate(weekStart));
  }, [weekStart, weekStartHydrated]);

  const saveTemplate = async (nextTemplate: WeeklySlot[]) => {
    if (!selectedTeacherId) return;
    try {
      await fetchJson(`/api/v1/journal/weekly-template?teacherId=${encodeURIComponent(selectedTeacherId)}`, {
        ...withIdempotencyHeaders(),
        method: 'PUT',
        body: JSON.stringify({
          slots: nextTemplate.map((slot) => ({
            weekday: slot.weekday,
            startTime: slot.start_time,
            startFrom: sanitizeIsoDate(slot.start_from),
            studentId: slot.student_id ?? null,
            isActive: true
          }))
        })
      });
      setWeeklyTemplate(nextTemplate);
      weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: nextTemplate });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось сохранить шаблон');
      throw error;
    }
  };

  const createSlotForDay = async (weekday: number, date: string): Promise<boolean> => {
    if (!selectedTeacherId) return false;
    const draft = dayDrafts[weekday];
    if (!draft || !draft.time) return false;

    setCreatingSlot(true);
    try {
      const created = await fetchJson<LessonSlot>('/api/v1/journal/slots', {
        ...withIdempotencyHeaders(),
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          date,
          startTime: draft.time,
          studentId: draft.studentId,
          repeatWeekly: false
        })
      });
      upsertSlotInState(created);
      scheduleSoftRefresh(selectedTeacherId);
      showSuccess('Разовое занятие создано');
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось создать слот');
      return false;
    } finally {
      setCreatingSlot(false);
    }
  };

  const assignStudent = async (slot: LessonSlot, studentId: string | null) => {
    if (!selectedTeacherId) return;
    setAssigningStudentSlotId(slot.id);
    try {
      const updated = await fetchJson<LessonSlot>(`/api/v1/journal/slots/${slot.id}`, {
        ...withIdempotencyHeaders(),
        method: 'PATCH',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          studentId,
          expectedLockVersion: slot.lock_version
        })
      });
      upsertSlotInState(updated);
      scheduleSoftRefresh(selectedTeacherId);
      setEditingStudentSlotId(null);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось назначить ученика');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
    } finally {
      setAssigningStudentSlotId((prev) => (prev === slot.id ? null : prev));
    }
  };

  const openStudentEditor = (slot: LessonSlot) => {
    if (slot.status === 'completed') return;
    if (slot.source_weekly_slot_id) {
      showError('Еженедельный слот редактируется в шаблоне недели');
      return;
    }
    const dateValue = new Date(`${slot.date}T00:00:00`);
    const weekday = ((dateValue.getDay() + 6) % 7) + 1;
    setDayDrafts((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] ?? createDayDraft()),
        time: slot.start_time,
        studentId: slot.student_id ?? null,
        repeatWeekly: Boolean(slot.source_weekly_slot_id)
      }
    }));
    setCreateSlotState({
      mode: 'edit',
      slotId: slot.id,
      weekday,
      date: slot.date
    });
  };

  const cancelStudentEditor = () => {
    setEditingStudentSlotId(null);
  };

  const saveStudentEditor = async (slot: LessonSlot) => {
    const value = slotStudentDrafts[slot.id] ?? (slot.student_id ?? FREE_SLOT_VALUE);
    await assignStudent(slot, value === FREE_SLOT_VALUE ? null : value);
  };

  const setStatus = async (
    slot: LessonSlot,
    status: Exclude<LessonStatus, 'rescheduled'>,
    options?: { studentId?: string | null; reason?: string; action?: 'confirm' | 'default' }
  ) => {
    if (slot.status === status) return;
    if (!selectedTeacherId) return;
    if (statusUpdatingSlotId === slot.id || confirmUpdatingSlotId === slot.id) return;
    if (status === 'completed' && isFutureMskDate(slot.date)) {
      showError('Нельзя завершить занятие будущего дня');
      return;
    }
    const previousSnapshot: LessonSlot = { ...slot };
    const isConfirmAction = options?.action === 'confirm';
    if (isConfirmAction) {
      setConfirmUpdatingSlotId(slot.id);
    } else {
      setStatusUpdatingSlotId(slot.id);
    }
    try {
      const previousStatus = slot.status;
      const nextStudentId = options?.studentId ?? slot.student_id;
      const optimisticSlot: LessonSlot = {
        ...slot,
        student_id: nextStudentId,
        status,
        status_reason: options?.reason ?? slot.status_reason,
        lock_version: slot.lock_version + 1
      };

      upsertSlotInState(optimisticSlot);

      if (previousStatus !== 'completed' && status === 'completed') {
        applyStudentBalanceDelta(nextStudentId, -1);
      } else if (previousStatus === 'completed' && status !== 'completed') {
        applyStudentBalanceDelta(nextStudentId, +1);
      }

      const updated = await fetchJson<LessonSlot>(`/api/v1/journal/slots/${slot.id}/status`, {
        ...withIdempotencyHeaders(),
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          status,
          studentId: options?.studentId,
          reason: options?.reason,
          expectedLockVersion: slot.lock_version
        })
      });
      upsertSlotInState(updated);
      syncStudentBalanceFromSlot(updated);
      scheduleSoftRefresh(selectedTeacherId);
      setEditingStudentSlotId(null);
    } catch (error) {
      upsertSlotInState(previousSnapshot);
      if (slot.status !== 'completed' && status === 'completed') {
        applyStudentBalanceDelta(options?.studentId ?? slot.student_id, +1);
      } else if (slot.status === 'completed' && status !== 'completed') {
        applyStudentBalanceDelta(options?.studentId ?? slot.student_id, -1);
      }
      showError(error instanceof Error ? error.message : 'Не удалось изменить статус');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
    } finally {
      if (isConfirmAction) {
        setConfirmUpdatingSlotId((prev) => (prev === slot.id ? null : prev));
      } else {
        setStatusUpdatingSlotId((prev) => (prev === slot.id ? null : prev));
      }
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleState) return;
    setStatusUpdatingSlotId(rescheduleState.slotId);
    try {
      const updated = await fetchJson<LessonSlot>(`/api/v1/journal/slots/${rescheduleState.slotId}/status`, {
        ...withIdempotencyHeaders(),
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          status: 'rescheduled',
          rescheduleToDate: rescheduleState.date,
          rescheduleToTime: rescheduleState.time,
          reason: rescheduleState.reason,
          expectedLockVersion: slots.find((slot) => slot.id === rescheduleState.slotId)?.lock_version
        })
      });
      upsertSlotInState(updated);
      syncStudentBalanceFromSlot(updated);
      scheduleSoftRefresh(selectedTeacherId);
      setRescheduleState(null);
      showSuccess('Занятие перенесено');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось перенести занятие');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
    } finally {
      setStatusUpdatingSlotId((prev) => (prev === rescheduleState.slotId ? null : prev));
    }
  };

  const submitCancel = async () => {
    if (!cancelState || !selectedTeacherId) return;
    setStatusUpdatingSlotId(cancelState.slotId);
    try {
      const updated = await fetchJson<LessonSlot>(`/api/v1/journal/slots/${cancelState.slotId}/status`, {
        ...withIdempotencyHeaders(),
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          status: 'canceled',
          reason: cancelState.reason,
          expectedLockVersion: slots.find((slot) => slot.id === cancelState.slotId)?.lock_version
        })
      });
      upsertSlotInState(updated);
      syncStudentBalanceFromSlot(updated);
      scheduleSoftRefresh(selectedTeacherId);
      setCancelState(null);
      showSuccess('Занятие отменено');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось отменить занятие');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
    } finally {
      setStatusUpdatingSlotId((prev) => (prev === cancelState.slotId ? null : prev));
    }
  };

  const deleteSlot = async (slot: LessonSlot) => {
    if (!selectedTeacherId) return;
    setDeletingSlotId(slot.id);
    try {
      await fetchJson(
        `/api/v1/journal/slots/${slot.id}?teacherId=${encodeURIComponent(selectedTeacherId)}&expectedLockVersion=${encodeURIComponent(String(slot.lock_version))}`,
        {
        ...withIdempotencyHeaders(),
        method: 'DELETE'
        }
      );
      removeSlotFromState(slot.id);
      scheduleSoftRefresh(selectedTeacherId);
      showSuccess('Слот удалён');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось удалить слот');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
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
        `/api/v1/journal/slots/${slot.id}?teacherId=${encodeURIComponent(selectedTeacherId)}&deleteMode=series&expectedLockVersion=${encodeURIComponent(String(slot.lock_version))}`,
        withIdempotencyHeaders({ method: 'DELETE' })
      );
      setWeeklyTemplate((prev) => prev.filter((item) => item.id !== slot.source_weekly_slot_id));
      setSlots((prev) =>
        prev.filter(
          (item) =>
            item.source_weekly_slot_id !== slot.source_weekly_slot_id ||
            item.status !== 'planned' ||
            item.date < slot.date
        )
      );
      scheduleSoftRefresh(selectedTeacherId);
      showSuccess('Слоты удалены');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Не удалось удалить еженедельный слот');
      if (isAdminConflictError(error)) {
        await loadAll();
      }
    } finally {
      setDeletingSlotId((prev) => (prev === slot.id ? null : prev));
    }
  };

  const openDeleteConfirm = (slot: LessonSlot) => {
    const isRescheduledTarget = rescheduledSourceByTargetSlotId.has(slot.id);
    if (slot.status !== 'planned' && !isRescheduledTarget) return;
    if (slot.rescheduled_to_slot_id) return;
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

  const applyRescheduleDate = useCallback(
    (nextDate: string) => {
      setRescheduleState((prev) => {
        if (!prev) return prev;
        const nextWeekday = getWeekdayFromIsoDate(nextDate);
        if (!nextWeekday) return { ...prev, date: nextDate };

        const occupied = getOccupiedTimesForDay(nextWeekday, nextDate, weeklyTemplate, slotMapByDate);
        const current = slots.find((slot) => slot.id === prev.slotId);
        const isForbiddenCurrentSlot =
          Boolean(prev.forbiddenSourceDate && prev.forbiddenSourceTime) &&
          current?.date === prev.forbiddenSourceDate &&
          current?.start_time === prev.forbiddenSourceTime;
        if (current && current.date === nextDate && !isForbiddenCurrentSlot) {
          occupied.delete(current.start_time);
        }
        if (prev.forbiddenSourceDate === nextDate && prev.forbiddenSourceTime) {
          occupied.add(prev.forbiddenSourceTime);
        }

        const nextTime = occupied.has(prev.time)
          ? (HOURLY_TIME_OPTIONS.find((option) => !occupied.has(option.value))?.value ?? prev.time)
          : prev.time;

        return { ...prev, date: nextDate, time: nextTime };
      });
    },
    [slotMapByDate, slots, weeklyTemplate]
  );

  const rescheduledSourceByTargetSlotId = useMemo(() => {
    const map = new Map<
      string,
      {
        sourceSlotId: string;
        sourceDate: string;
        sourceStartTime: string;
        sourceWeeklySlotId: string | null;
        sourceReason: string | null;
      }
    >();
    for (const slot of slots) {
      if (slot.status !== 'rescheduled' || !slot.rescheduled_to_slot_id) continue;
      if (map.has(slot.rescheduled_to_slot_id)) continue;
      map.set(slot.rescheduled_to_slot_id, {
        sourceSlotId: slot.id,
        sourceDate: slot.date,
        sourceStartTime: slot.start_time,
        sourceWeeklySlotId: slot.source_weekly_slot_id ?? null,
        sourceReason: slot.status_reason ?? null
      });
    }
    return map;
  }, [slots]);

  const openRescheduleEditorForTargetSlot = (
    targetSlot: LessonSlot,
    source: {
      sourceSlotId: string;
      sourceDate: string;
      sourceStartTime: string;
      sourceReason: string | null;
    } | null
  ) => {
    if (!source) return;
    setRescheduleState({
      slotId: source.sourceSlotId,
      date: targetSlot.date,
      time: targetSlot.start_time,
      reason: RESCHEDULE_REASONS.includes((source.sourceReason ?? '') as (typeof RESCHEDULE_REASONS)[number])
        ? (source.sourceReason as (typeof RESCHEDULE_REASONS)[number])
        : RESCHEDULE_REASONS[0],
      forbiddenSourceDate: source.sourceDate,
      forbiddenSourceTime: source.sourceStartTime
    });
  };

  const createSlotOccupiedTimes = useMemo(() => {
    if (!createSlotState) return new Set<string>();
    const occupied = getOccupiedTimesForDay(createSlotState.weekday, createSlotState.date, weeklyTemplate, slotMapByDate);
    if (createSlotState.mode === 'edit' && createSlotState.slotId) {
      const current = slots.find((slot) => slot.id === createSlotState.slotId);
      if (current) occupied.delete(current.start_time);
    }
    return occupied;
  }, [createSlotState, weeklyTemplate, slotMapByDate, slots]);

  const rescheduleOccupiedTimes = useMemo(() => {
    if (!rescheduleState) return new Set<string>();
    const weekday = getWeekdayFromIsoDate(rescheduleState.date);
    if (!weekday) return new Set<string>();

    const occupied = getOccupiedTimesForDay(weekday, rescheduleState.date, weeklyTemplate, slotMapByDate);
    const current = slots.find((slot) => slot.id === rescheduleState.slotId);
    const isForbiddenCurrentSlot =
      Boolean(rescheduleState.forbiddenSourceDate && rescheduleState.forbiddenSourceTime) &&
      current?.date === rescheduleState.forbiddenSourceDate &&
      current?.start_time === rescheduleState.forbiddenSourceTime;
    if (current && current.date === rescheduleState.date && !isForbiddenCurrentSlot) {
      occupied.delete(current.start_time);
    }
    if (rescheduleState.forbiddenSourceDate === rescheduleState.date && rescheduleState.forbiddenSourceTime) {
      occupied.add(rescheduleState.forbiddenSourceTime);
    }
    return occupied;
  }, [rescheduleState, weeklyTemplate, slotMapByDate, slots]);

  const occupiedStudentIdsBySlot = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const slot of slots) {
      const key = `${slot.date}|${slot.start_time}`;
      const bucket = map.get(key) ?? new Set<string>();
      if (slot.student_id) bucket.add(slot.student_id);
      map.set(key, bucket);
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
    const selectedTime = dayDrafts[createSlotState.weekday]?.time ?? '';
    if (!selectedTime || createSlotOccupiedTimes.has(selectedTime)) {
      showError('Выберите свободное время');
      return;
    }

    if (createSlotState.mode === 'edit' && createSlotState.slotId) {
      if (!selectedTeacherId) return;
      const draft = dayDrafts[createSlotState.weekday];
      if (!draft) return;

      setCreatingSlot(true);
      try {
        const currentSlot = slots.find((slot) => slot.id === createSlotState.slotId);
        const isEditingRescheduledTargetSlot = currentSlot ? rescheduledSourceByTargetSlotId.has(currentSlot.id) : false;
        const updated = await fetchJson<LessonSlot>(`/api/v1/journal/slots/${createSlotState.slotId}`, {
          ...withIdempotencyHeaders(),
          method: 'PATCH',
          body: JSON.stringify({
            teacherId: selectedTeacherId,
            date: createSlotState.date,
            startTime: draft.time,
            studentId: isEditingRescheduledTargetSlot ? (currentSlot?.student_id ?? null) : draft.studentId,
            expectedLockVersion: currentSlot?.lock_version
          })
        });
        upsertSlotInState(updated);
        setCreateSlotState(null);
        showSuccess('Слот обновлен');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Не удалось обновить слот');
        if (isAdminConflictError(error)) {
          await loadAll();
        }
      } finally {
        setCreatingSlot(false);
      }
      return;
    }

    const nextState = createSlotState;
    setCreateSlotState(null);
    await createSlotForDay(nextState.weekday, nextState.date);
  };

  const openCreateSlotModal = (weekday: number, date: string) => {
    const occupiedTimes = getOccupiedTimesForDay(weekday, date, weeklyTemplate, slotMapByDate);
    const firstAvailableTime = HOURLY_TIME_OPTIONS.find((option) => !occupiedTimes.has(option.value))?.value ?? '';

    setDayDrafts((prev) => {
      const draft = prev[weekday] ?? createDayDraft();
      const nextTime = draft.time && !occupiedTimes.has(draft.time) ? draft.time : firstAvailableTime;

      return {
        ...prev,
        [weekday]: {
          ...draft,
          time: nextTime,
          repeatWeekly: false
        }
      };
    });

    setCreateSlotState({ mode: 'create', weekday, date });
  };

  const weeklyTemplateByWeekday = useMemo(() => {
    const map = new Map<number, WeeklySlot[]>();
    for (const slot of weeklyTemplate) {
      const list = map.get(slot.weekday) ?? [];
      list.push(slot);
      map.set(slot.weekday, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [weeklyTemplate]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of students) {
      map.set(student.id, student.full_name);
    }
    return map;
  }, [students]);

  const studentPaidLessonsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const student of students) {
      map.set(student.id, Math.max(0, Number(student.paid_lessons_left ?? 0)));
    }
    return map;
  }, [students]);

  const forecastBySlotId = useMemo(() => {
    return calculateForecastBySlotId({
      slots,
      studentPaidLessonsById,
      plannedBaselineByStudentId
    });
  }, [slots, studentPaidLessonsById, plannedBaselineByStudentId]);

  const earliestOverdueSortKeyByStudentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of slots) {
      if (slot.status !== 'overdue' || !slot.student_id) continue;
      const sortKey = getSlotSortKey(slot.date, slot.start_time);
      const currentMinSortKey = map.get(slot.student_id);
      if (!currentMinSortKey || sortKey < currentMinSortKey) {
        map.set(slot.student_id, sortKey);
      }
    }
    return map;
  }, [slots]);

  const selectedTeacherName = useMemo(() => {
    if (!selectedTeacherId) return 'Преподаватель';
    return teachers.find((item) => item.id === selectedTeacherId)?.full_name ?? 'Преподаватель';
  }, [selectedTeacherId, teachers]);

  const templateTotalSlots = useMemo(() => weeklyTemplate.length, [weeklyTemplate]);
  const templateAssignedSlots = useMemo(
    () => weeklyTemplate.filter((slot) => Boolean(slot.student_id)).length,
    [weeklyTemplate]
  );
  const templateLoadPercent = templateTotalSlots > 0 ? Math.round((templateAssignedSlots / templateTotalSlots) * 100) : 0;

  const openTemplateSlotModal = (weekday: number, slot?: WeeklySlot) => {
    if (slot) {
      setDayDrafts((prev) => ({
        ...prev,
        [weekday]: {
          ...(prev[weekday] ?? createDayDraft()),
          time: slot.start_time,
          startFrom: sanitizeIsoDate(slot.start_from) ?? toIsoDate(new Date()),
          studentId: slot.student_id ?? null,
          repeatWeekly: true
        }
      }));
      setTemplateSlotState({ weekday, slotId: slot.id });
      return;
    }

    const occupiedTimes = new Set((weeklyTemplateByWeekday.get(weekday) ?? []).map((item) => item.start_time));
    const firstAvailableTime = HOURLY_TIME_OPTIONS.find((option) => !occupiedTimes.has(option.value))?.value ?? '10:00';
    setDayDrafts((prev) => ({
      ...prev,
        [weekday]: {
          ...(prev[weekday] ?? createDayDraft()),
          time: firstAvailableTime,
          startFrom: toIsoDate(new Date()),
          studentId: null,
          repeatWeekly: true
        }
    }));
    setTemplateSlotState({ weekday });
  };

  const saveTemplateSlot = async () => {
    if (!templateSlotState) return;
    const draft = dayDrafts[templateSlotState.weekday];
    if (!draft?.time) {
      showError('Выберите время');
      return;
    }
    if (!draft.startFrom) {
      showError('Укажите дату начала занятий');
      return;
    }

    const exists = (weeklyTemplateByWeekday.get(templateSlotState.weekday) ?? []).some(
      (slot) => slot.start_time === draft.time && slot.id !== templateSlotState.slotId
    );
    if (exists) {
      showError('Слот с этим временем уже есть в шаблоне');
      return;
    }

    const nextTemplate = templateSlotState.slotId
      ? weeklyTemplate.map((slot) =>
          slot.id === templateSlotState.slotId
            ? {
                ...slot,
                start_time: draft.time,
                start_from: draft.startFrom,
                student_id: draft.studentId
              }
            : slot
        )
      : [
          ...weeklyTemplate,
          {
            id: `temp-${templateSlotState.weekday}-${draft.time}-${Date.now()}`,
            weekday: templateSlotState.weekday,
            start_time: draft.time,
            start_from: draft.startFrom,
            student_id: draft.studentId,
            is_active: 1
          } as WeeklySlot
        ];

    await saveTemplate(nextTemplate);
    setTemplateSlotState(null);
    showSuccess('Шаблон недели сохранен');
  };

  const removeTemplateSlot = async (slotId: string) => {
    await saveTemplate(weeklyTemplate.filter((slot) => slot.id !== slotId));
    showSuccess('Слот удален из шаблона недели');
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
      <div className="flex min-h-9 items-center gap-2">
        {loading && teachers.length === 0 ? <Skeleton className="h-9 w-[320px]" /> : null}
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
        <Button
          variant="outline"
          className="h-9 gap-2"
          aria-label="Открыть шаблон недели"
          disabled={!selectedTeacherId}
          onClick={() => setTemplateSheetOpen(true)}
        >
          <CalendarDays absoluteStrokeWidth className="size-4" />
          <span>Шаблон недели</span>
        </Button>
      </div>
      <div className="h-px w-full bg-border" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold">Журнал занятий</h3>
          <Badge variant="outline">{weekRangeLabel}</Badge>
        </div>
        <ButtonGroup className="shrink-0">
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={!canGoToPreviousWeek}
            aria-label="Предыдущая неделя"
            onClick={() => setWeekStart(clampWeekStart(addDays(weekStart, -7)))}
          >
            <ArrowLeft absoluteStrokeWidth className="size-4" />
          </Button>
          <Button
            variant="secondary"
            disabled={isCurrentWeekSelected}
            onClick={() => setWeekStart(clampWeekStart(getWeekStart(new Date())))}
          >
            Текущая неделя
          </Button>
          <Button variant="secondary" size="icon-sm" aria-label="Следующая неделя" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ArrowRight absoluteStrokeWidth className="size-4" />
          </Button>
        </ButtonGroup>
      </div>

      <div
        ref={weekColumnsScrollRef}
        onMouseDown={handleColumnsMouseDown}
        onMouseLeave={stopColumnsDrag}
        className={`h-[calc(100dvh-16px)] w-full overflow-auto rounded-xl bg-muted/30 p-[8px] ${isDraggingColumns ? 'cursor-grabbing' : 'cursor-default'}`}
      >
        <div className="grid grid-cols-1 gap-3 lg:flex lg:min-w-max lg:items-start">
          {weekDays.map((day) => (
            <Card key={day.dateIso} data-journal-day-column className="cursor-default lg:w-[360px] lg:min-w-[360px]">
            <CardHeader>
              <CardTitle>{day.dateLabel}</CardTitle>
              <CardDescription>{day.full}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading ? (
                <>
                  <div className="space-y-2 rounded-lg border border-border/50 p-3">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-8 w-52" />
                  </div>
                  <div className="space-y-2 rounded-lg border border-border/50 p-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-8 w-48" />
                  </div>
                </>
              ) : (slotMapByDate.get(day.dateIso) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{loading ? 'Загрузка...' : 'Нет слотов'}</p>
              ) : (
                (slotMapByDate.get(day.dateIso) ?? []).map((slot) => (
                  <Card key={slot.id} data-journal-slot-card className="cursor-default">
                    <CardContent className="flex flex-col gap-3">
                      {(() => {
                        const draftValue = slotStudentDrafts[slot.id];
                        const effectiveStudentId =
                          editingStudentSlotId === slot.id
                            ? draftValue === FREE_SLOT_VALUE
                              ? null
                              : (draftValue ?? slot.student_id)
                            : slot.student_id;
                        const isStudentMissing = !effectiveStudentId;
                        const isStudentConflict = Boolean(
                          effectiveStudentId &&
                          occupiedStudentIdsBySlot.get(`${slot.date}|${slot.start_time}`)?.has(effectiveStudentId) &&
                          effectiveStudentId !== slot.student_id
                        );
                        const effectiveStudentPaidLessonsLeft = effectiveStudentId
                          ? Math.max(0, Number(studentPaidLessonsById.get(effectiveStudentId) ?? slot.student_paid_lessons_left ?? 0))
                          : 0;
                        const isStudentBalanceEmpty = !isStudentMissing && slot.status !== 'completed' && effectiveStudentPaidLessonsLeft <= 0;
                        const slotSortKey = getSlotSortKey(slot.date, slot.start_time);
                        const earliestOverdueSortKey = effectiveStudentId
                          ? earliestOverdueSortKeyByStudentId.get(effectiveStudentId)
                          : undefined;
                        const hasUnconfirmedLessons =
                          !isStudentMissing &&
                          slot.status !== 'completed' &&
                          Boolean(earliestOverdueSortKey && earliestOverdueSortKey < slotSortKey);
                        const confirmTooltip = isStudentMissing
                          ? 'Нельзя подтвердить занятие без ученика'
                          : isStudentConflict
                            ? 'У выбранного ученика уже есть занятие в это время'
                            : slot.status === 'canceled'
                              ? 'Сначала снимите отмену занятия'
                            : hasUnconfirmedLessons
                              ? 'Есть неподтвержденные занятия'
                            : isStudentBalanceEmpty
                              ? 'Недостаточно оплаченных занятий у ученика'
                            : slot.status !== 'completed' && isFutureMskDate(slot.date)
                              ? 'Нельзя завершить занятие будущего дня'
                            : slot.status === 'completed'
                              ? slot.date < getCurrentMskIsoDate()
                                ? 'Нажмите, чтобы вернуть в «Просрочено»'
                                : 'Нажмите, чтобы вернуть в Запланировано'
                              : undefined;
                        const isFutureDayCompletionForbidden = slot.status !== 'completed' && isFutureMskDate(slot.date);
                        const forecastPaidLessonsLeft = forecastBySlotId.get(slot.id);
                        const rescheduledSource = rescheduledSourceByTargetSlotId.get(slot.id);
                        const isRegularLesson = rescheduledSource
                          ? Boolean(rescheduledSource.sourceWeeklySlotId)
                          : Boolean(slot.source_weekly_slot_id);
                        const lessonTypeLabel = isRegularLesson ? 'Регулярное' : 'Разовое';
                        const isRescheduledSourceSlot = slot.status === 'rescheduled' && Boolean(slot.reschedule_target_date);
                        const isRescheduledTargetSlot = Boolean(rescheduledSource);
                        const slotCurrentSortKey = getSlotSortKey(slot.date, slot.start_time);
                        const rescheduleTargetSortKey =
                          isRescheduledSourceSlot && slot.reschedule_target_date
                            ? getSlotSortKey(slot.reschedule_target_date, slot.reschedule_target_time ?? slot.start_time)
                            : null;
                        const isRescheduledToFuture =
                          Boolean(rescheduleTargetSortKey && rescheduleTargetSortKey > slotCurrentSortKey);
                        const rescheduleSourceSortKey =
                          isRescheduledTargetSlot && rescheduledSource
                            ? getSlotSortKey(rescheduledSource.sourceDate, rescheduledSource.sourceStartTime)
                            : null;
                        const isRescheduledFromFuture =
                          Boolean(rescheduleSourceSortKey && rescheduleSourceSortKey > slotCurrentSortKey);
                        const rescheduledToDateLabel = formatDayMonthRu(slot.reschedule_target_date);
                        const rescheduledFromDateLabel = formatDayMonthRu(rescheduledSource?.sourceDate ?? null);
                        const shouldShowSlotActions = !slot.rescheduled_to_slot_id;
                        const isRescheduledTargetWithSource = isRescheduledTargetSlot && Boolean(rescheduledSource?.sourceSlotId);
                        const shouldShowActionsMenu = !isRegularLesson || isRescheduledTargetSlot;
                        const canDeleteSlot =
                          !slot.source_weekly_slot_id &&
                          !slot.rescheduled_to_slot_id &&
                          (slot.status === 'planned' || isRescheduledTargetSlot);
                        const canDeleteReschedule = isRescheduledTargetWithSource;
                        const cancelTooltip =
                          slot.status === 'canceled'
                            ? slot.date < getCurrentMskIsoDate()
                              ? 'Нажмите, чтобы вернуть в «Просрочено»'
                              : 'Нажмите, чтобы вернуть в Запланировано'
                            : 'Отменить занятие';
                        const isConfirmSaving = confirmUpdatingSlotId === slot.id;

                        return (
                          <>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline">{slot.start_time}</Badge>
                        <Badge variant="secondary">{lessonTypeLabel}</Badge>
                        {isRescheduledSourceSlot ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                                  {isRescheduledToFuture ? (
                                    <>
                                      {rescheduledToDateLabel}
                                      <ArrowRight className="ml-1 size-3.5" />
                                    </>
                                  ) : (
                                    <>
                                      <ArrowLeft className="mr-1 size-3.5" />
                                      {rescheduledToDateLabel}
                                    </>
                                  )}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={6}>
                                <span>{`перенесено на ${rescheduledToDateLabel}`}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : isRescheduledTargetSlot ? (
                          slot.status === 'completed' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className={statusBadgeClass('completed')}>
                                    {isRescheduledFromFuture ? (
                                      <>
                                        {statusLabel('completed')}
                                        <ArrowRight className="ml-1 size-3.5" />
                                      </>
                                    ) : (
                                      <>
                                        <ArrowLeft className="mr-1 size-3.5" />
                                        {statusLabel('completed')}
                                      </>
                                    )}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                  <span>{`перенесено с ${rescheduledFromDateLabel}`}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                                    {isRescheduledFromFuture ? (
                                      <>
                                        {rescheduledFromDateLabel}
                                        <ArrowRight className="ml-1 size-3.5" />
                                      </>
                                    ) : (
                                      <>
                                        <ArrowLeft className="mr-1 size-3.5" />
                                        {rescheduledFromDateLabel}
                                      </>
                                    )}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                  <span>{`перенесено с ${rescheduledFromDateLabel}`}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        ) : (
                          <Badge className={statusBadgeClass(slot.status)}>{statusLabel(slot.status)}</Badge>
                        )}
                        {!isRescheduledSourceSlot && typeof forecastPaidLessonsLeft === 'number' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline">{forecastPaidLessonsLeft}</Badge>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={6}>
                                <span>Прогноз оставшихся занятий</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>

                      {editingStudentSlotId === slot.id ? (
                        <div className="flex flex-col gap-2">
                          <Select
                            value={slotStudentDrafts[slot.id] ?? (slot.student_id ?? FREE_SLOT_VALUE)}
                            onValueChange={(value) =>
                              setSlotStudentDrafts((prev) => ({
                                ...prev,
                                [slot.id]: value
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите ученика" />
                            </SelectTrigger>
                            <SelectContent>
                              {studentOptions.map((option) => {
                                if (option.value === FREE_SLOT_VALUE) {
                                  return (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  );
                                }

                                const takenByAnotherStudent =
                                  occupiedStudentIdsBySlot
                                    .get(`${slot.date}|${slot.start_time}`)
                                    ?.has(option.value) && option.value !== slot.student_id;

                                return (
                                  <SelectItem key={option.value} value={option.value} disabled={Boolean(takenByAnotherStudent)}>
                                    {takenByAnotherStudent ? `${option.label} — занято` : option.label}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <Button
                              size="xs"
                              onClick={() => void saveStudentEditor(slot)}
                              disabled={assigningStudentSlotId === slot.id}
                            >
                              {assigningStudentSlotId === slot.id ? 'Сохранение...' : 'Сохранить'}
                            </Button>
                            <Button size="xs" variant="secondary" onClick={cancelStudentEditor} disabled={assigningStudentSlotId === slot.id}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-1 py-1 text-sm">
                          {slot.student_full_name ? (
                            <div className="flex items-center gap-2">
                              <UIAvatar size="sm" className="ring-1 ring-border/60">
                                <AvatarFallback
                                  className="font-semibold text-white"
                                  style={{
                                    backgroundColor: getStableAvatarColor(
                                      getStableAvatarSeed({
                                        id: slot.student_id,
                                        firstName: slot.student_full_name.split(/\s+/)[0] ?? null,
                                        fallbackFullName: slot.student_full_name
                                      })
                                    )
                                  }}
                                >
                                  {getStableAvatarInitial({
                                    firstName: slot.student_full_name.split(/\s+/)[0] ?? null,
                                    fallbackFullName: slot.student_full_name
                                  })}
                                </AvatarFallback>
                              </UIAvatar>
                              <span className="font-semibold">{slot.student_full_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Ученик не назначен</span>
                          )}
                        </div>
                      )}

                      {shouldShowSlotActions ? (
                        slot.student_id ? (
                        <div className="flex w-full justify-start">
                        <ButtonGroup className="shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Toggle
                                  variant="outline"
                                  size="sm"
                                  data-segment="first"
                                  pressed={slot.status === 'canceled'}
                                  className="shrink-0 rounded-r-none border-r-0 px-1.5 in-data-[slot=button-group]:rounded-r-none"
                                  aria-label="Отменить занятие"
                                  disabled={deletingSlotId === slot.id || statusUpdatingSlotId === slot.id || slot.status === 'completed'}
                                  onPressedChange={(pressed) => {
                                    if (pressed) {
                                      setCancelState({
                                        slotId: slot.id,
                                        reason: RESCHEDULE_REASONS.includes((slot.status_reason ?? '') as (typeof RESCHEDULE_REASONS)[number])
                                          ? (slot.status_reason as (typeof RESCHEDULE_REASONS)[number])
                                          : RESCHEDULE_REASONS[0]
                                      });
                                      return;
                                    }
                                    void setStatus(slot, 'planned', {
                                      studentId: effectiveStudentId ?? undefined
                                    });
                                  }}
                                >
                                  <Image
                                    src={slot.status === 'canceled' ? '/icons/journal-canceled.svg' : '/icons/journal-cancel.svg'}
                                    alt=""
                                    aria-hidden="true"
                                    width={16}
                                    height={16}
                                    className="size-4"
                                  />
                                </Toggle>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>
                              <span>{cancelTooltip}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  data-segment="middle"
                                  className="!rounded-none border-r border-r-border in-data-[slot=button-group]:!rounded-none"
                                  aria-label="Перенести"
                                  disabled={deletingSlotId === slot.id || statusUpdatingSlotId === slot.id || slot.status === 'completed' || slot.status === 'canceled'}
                                  onClick={() =>
                                    setRescheduleState({
                                      slotId: slot.id,
                                      date: slot.date,
                                      time: slot.start_time,
                                      reason: RESCHEDULE_REASONS.includes((slot.status_reason ?? '') as (typeof RESCHEDULE_REASONS)[number])
                                        ? (slot.status_reason as (typeof RESCHEDULE_REASONS)[number])
                                        : RESCHEDULE_REASONS[0]
                                    })
                                  }
                                >
                                  <CircleArrowRight absoluteStrokeWidth className="size-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>
                              <span>Перенести занятие</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Toggle
                                variant="outline"
                                size="sm"
                                data-segment={isRegularLesson ? 'last' : 'middle'}
                                pressed={slot.status === 'completed'}
                                aria-label="Подтвердить занятие"
                                disabled={
                                  deletingSlotId === slot.id ||
                                  statusUpdatingSlotId === slot.id ||
                                  isConfirmSaving ||
                                  slot.status === 'canceled' ||
                                  (slot.status !== 'completed' && (isStudentMissing || isStudentConflict || hasUnconfirmedLessons || isStudentBalanceEmpty || isFutureDayCompletionForbidden))
                                }
                                onPressedChange={(pressed) =>
                                  void setStatus(slot, pressed ? 'completed' : 'planned', {
                                    studentId: effectiveStudentId ?? undefined,
                                    action: 'confirm'
                                  })
                                }
                                className={
                                  isRegularLesson
                                    ? 'shrink-0 justify-start gap-1.5 rounded-l-none rounded-r-lg border-l border-l-border pr-[10px] pl-1.5'
                                    : 'shrink-0 justify-start gap-1.5 rounded-l-none rounded-r-none border-l border-l-border border-r-0 pr-[10px] pl-1.5'
                                }
                              >
                                {isConfirmSaving ? (
                                  <Loader className="size-4 animate-spin" />
                                ) : (
                                  <Image
                                    src={slot.status === 'completed' ? '/icons/journal-confirmed.svg' : '/icons/journal-confirm.svg'}
                                    alt=""
                                    aria-hidden="true"
                                    width={16}
                                    height={16}
                                    className="size-4"
                                  />
                                )}
                                <span className="inline-grid justify-items-start text-left">
                                  <span className="col-start-1 row-start-1 invisible">Подтверждено</span>
                                  <span className="col-start-1 row-start-1">
                                    {slot.status === 'completed' ? 'Подтверждено' : 'Подтвердить'}
                                  </span>
                                </span>
                              </Toggle>
                            </TooltipTrigger>
                            {confirmTooltip ? (
                              <TooltipContent sideOffset={6}>
                                <span>{confirmTooltip}</span>
                              </TooltipContent>
                            ) : null}
                          </Tooltip>
                        </TooltipProvider>

                        {shouldShowActionsMenu ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              data-segment="last"
                              className="rounded-l-none rounded-r-lg"
                              aria-label="Список действий"
                              disabled={
                                deletingSlotId === slot.id ||
                                statusUpdatingSlotId === slot.id ||
                                assigningStudentSlotId === slot.id ||
                                slot.status === 'completed'
                              }
                            >
                              <Ellipsis absoluteStrokeWidth className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              disabled={
                                slot.status === 'completed' ||
                                (!isRescheduledTargetWithSource && Boolean(slot.source_weekly_slot_id))
                              }
                              onSelect={() => {
                                if (isRescheduledTargetWithSource) {
                                  openRescheduleEditorForTargetSlot(slot, rescheduledSource ?? null);
                                  return;
                                }
                                openStudentEditor(slot);
                              }}
                            >
                              {isRescheduledTargetWithSource ? 'Редактировать перенос' : 'Редактировать'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="whitespace-nowrap"
                              variant="destructive"
                              disabled={isRescheduledTargetWithSource ? !canDeleteReschedule : !canDeleteSlot}
                              onSelect={() => openDeleteConfirm(slot)}
                            >
                              {isRescheduledTargetWithSource ? 'Удалить перенос' : 'Удалить занятие'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        ) : null}
                        </ButtonGroup>
                        </div>
                      ) : (
                        <div className="flex w-full items-center justify-start gap-2">
                          <Select
                            value={FREE_SLOT_VALUE}
                            onValueChange={(value) => {
                              if (value === FREE_SLOT_VALUE) return;
                              void assignStudent(slot, value);
                            }}
                            disabled={deletingSlotId === slot.id || statusUpdatingSlotId === slot.id || assigningStudentSlotId === slot.id}
                          >
                            <SelectTrigger className="h-7 w-[220px] rounded-lg">
                              <SelectValue placeholder="Назначить ученика" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={FREE_SLOT_VALUE} disabled>
                                Назначить ученика
                              </SelectItem>
                              {studentOptions
                                .filter((option) => option.value !== FREE_SLOT_VALUE)
                                .map((option) => {
                                  const takenByAnotherStudent = occupiedStudentIdsBySlot
                                    .get(`${slot.date}|${slot.start_time}`)
                                    ?.has(option.value);
                                  return (
                                    <SelectItem key={option.value} value={option.value} disabled={Boolean(takenByAnotherStudent)}>
                                      {takenByAnotherStudent ? `${option.label} — занято` : option.label}
                                    </SelectItem>
                                  );
                                })}
                            </SelectContent>
                          </Select>

                          {shouldShowActionsMenu ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="Список действий"
                                disabled={
                                  deletingSlotId === slot.id ||
                                  statusUpdatingSlotId === slot.id ||
                                  assigningStudentSlotId === slot.id ||
                                  slot.status === 'completed'
                                }
                              >
                                <Ellipsis absoluteStrokeWidth className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                disabled={
                                  slot.status === 'completed' ||
                                  (!isRescheduledTargetWithSource && Boolean(slot.source_weekly_slot_id))
                                }
                                onSelect={() => {
                                  if (isRescheduledTargetWithSource) {
                                    openRescheduleEditorForTargetSlot(slot, rescheduledSource ?? null);
                                    return;
                                  }
                                  openStudentEditor(slot);
                                }}
                              >
                                {isRescheduledTargetWithSource ? 'Редактировать перенос' : 'Редактировать'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="whitespace-nowrap"
                                variant="destructive"
                                disabled={isRescheduledTargetWithSource ? !canDeleteReschedule : !canDeleteSlot}
                                onSelect={() => openDeleteConfirm(slot)}
                              >
                                {isRescheduledTargetWithSource ? 'Удалить перенос' : 'Удалить занятие'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          ) : null}
                        </div>
                      )
                      ) : null}
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))
              )}

              <Button
                variant="secondary"
                className="cursor-pointer transition-colors hover:bg-secondary/80"
                onClick={() => openCreateSlotModal(day.weekday, day.dateIso)}
                disabled={!selectedTeacherId || loading}
              >
                Добавить разовое занятие
              </Button>
            </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(createSlotState)} onOpenChange={(open) => !open && setCreateSlotState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createSlotState
                ? `${createSlotState.mode === 'edit' ? 'Редактировать слот' : 'Новый слот'}: ${DAYS.find((item) => item.weekday === createSlotState.weekday)?.full ?? ''}, ${new Date(
                    `${createSlotState.date}T00:00:00`
                  ).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`
                : 'Новый слот'}
            </DialogTitle>
          </DialogHeader>

          {createSlotState ? (
            <div className="flex flex-col gap-3">
              {(() => {
                const isEditingRescheduledTargetSlot =
                  createSlotState.mode === 'edit' &&
                  Boolean(createSlotState.slotId && rescheduledSourceByTargetSlotId.has(createSlotState.slotId));

                return (
                  <>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Время</span>
                <div className="grid grid-cols-6 gap-2">
                  {HOURLY_TIME_OPTIONS.map((option) => {
                    const selectedTime = dayDrafts[createSlotState.weekday]?.time ?? '10:00';
                    const isOccupied = createSlotOccupiedTimes.has(option.value);
                    const isActive = selectedTime === option.value;

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        className={isOccupied ? 'h-12 cursor-not-allowed opacity-60' : 'h-12 cursor-pointer'}
                        disabled={isOccupied}
                        onClick={() =>
                          setDayDrafts((prev) => ({
                            ...prev,
                            [createSlotState.weekday]: {
                              ...(prev[createSlotState.weekday] ?? createDayDraft()),
                              time: option.value
                            }
                          }))
                        }
                      >
                        {isOccupied ? (
                          <span className="flex flex-col leading-tight">
                            <span>{option.label}</span>
                            <span className="text-[10px]">Занято</span>
                          </span>
                        ) : (
                          option.label
                        )}
                      </Button>
                    );
                  })}
                </div>
                {HOURLY_TIME_OPTIONS.every((option) => createSlotOccupiedTimes.has(option.value)) ? (
                  <p className="text-xs text-muted-foreground">На этот день все часы уже заняты.</p>
                ) : null}
              </div>

              {!isEditingRescheduledTargetSlot ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Ученик</span>
                  <Select
                    value={dayDrafts[createSlotState.weekday]?.studentId ?? undefined}
                    onValueChange={(value) =>
                      setDayDrafts((prev) => ({
                        ...prev,
                        [createSlotState.weekday]: {
                          ...(prev[createSlotState.weekday] ?? createDayDraft()),
                          studentId: value
                        }
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите ученика" />
                    </SelectTrigger>
                    <SelectContent>
                      {studentOptions
                        .filter((option) => option.value !== FREE_SLOT_VALUE)
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

                  </>
                );
              })()}
            </div>
          ) : null}

          <DialogFooter>
            {createSlotState && HOURLY_TIME_OPTIONS.every((option) => createSlotOccupiedTimes.has(option.value)) ? (
              <p className="mr-auto text-xs text-muted-foreground">Свободных часов нет. Выберите другой день или удалите/перенесите слот.</p>
            ) : null}
            <Button variant="secondary" onClick={() => setCreateSlotState(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => void submitCreateSlot()}
              disabled={
                !selectedTeacherId ||
                !createSlotState ||
                !(dayDrafts[createSlotState.weekday]?.time ?? '') ||
                createSlotOccupiedTimes.has(dayDrafts[createSlotState.weekday]?.time ?? '') ||
                creatingSlot
              }
            >
              {creatingSlot ? (createSlotState?.mode === 'edit' ? 'Сохраняем...' : 'Добавляем...') : createSlotState?.mode === 'edit' ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(templateSlotState)} onOpenChange={(open) => !open && setTemplateSlotState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {templateSlotState
                ? `${templateSlotState.slotId ? 'Редактировать шаблон' : 'Новый слот шаблона'}: ${DAYS.find((item) => item.weekday === templateSlotState.weekday)?.full ?? ''}`
                : 'Шаблон недели'}
            </DialogTitle>
          </DialogHeader>

          {templateSlotState ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Время</span>
                <div className="grid grid-cols-6 gap-2">
                  {HOURLY_TIME_OPTIONS.map((option) => {
                    const selectedTime = dayDrafts[templateSlotState.weekday]?.time ?? '10:00';
                    const isOccupied = (weeklyTemplateByWeekday.get(templateSlotState.weekday) ?? []).some(
                      (slot) => slot.start_time === option.value && slot.id !== templateSlotState.slotId
                    );
                    const isActive = selectedTime === option.value;

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        className={isOccupied ? 'h-12 cursor-not-allowed opacity-60' : 'h-12 cursor-pointer'}
                        disabled={isOccupied}
                        onClick={() =>
                          setDayDrafts((prev) => ({
                            ...prev,
                            [templateSlotState.weekday]: {
                              ...(prev[templateSlotState.weekday] ?? createDayDraft()),
                              time: option.value,
                              repeatWeekly: true
                            }
                          }))
                        }
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Ученик</span>
                <Select
                  value={dayDrafts[templateSlotState.weekday]?.studentId ?? FREE_SLOT_VALUE}
                  onValueChange={(value) =>
                    setDayDrafts((prev) => ({
                      ...prev,
                      [templateSlotState.weekday]: {
                        ...(prev[templateSlotState.weekday] ?? createDayDraft()),
                        studentId: value === FREE_SLOT_VALUE ? null : value,
                        repeatWeekly: true
                      }
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ученик (опционально)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREE_SLOT_VALUE}>Без ученика</SelectItem>
                    {studentOptions
                      .filter((option) => option.value !== FREE_SLOT_VALUE)
                      .map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">Дата начала занятий</span>
                <Input
                  type="date"
                  value={dayDrafts[templateSlotState.weekday]?.startFrom ?? ''}
                  onChange={(event) =>
                    setDayDrafts((prev) => ({
                      ...prev,
                      [templateSlotState.weekday]: {
                        ...(prev[templateSlotState.weekday] ?? createDayDraft()),
                        startFrom: event.target.value || null,
                        repeatWeekly: true
                      }
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setTemplateSlotState(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => void saveTemplateSlot()}
              disabled={
                !templateSlotState ||
                !(dayDrafts[templateSlotState.weekday]?.time ?? '') ||
                !(dayDrafts[templateSlotState.weekday]?.startFrom ?? '')
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={templateSheetOpen} onOpenChange={setTemplateSheetOpen}>
        <SheetContent side="right" className="w-full max-w-[912px] p-0 sm:max-w-[912px]">
          <SheetHeader className="space-y-3 border-b">
            <SheetTitle>{selectedTeacherName}</SheetTitle>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Загруженность</span>
                <span className="font-medium">{`${templateAssignedSlots} из ${templateTotalSlots} (${templateLoadPercent}%)`}</span>
              </div>
              <Progress value={templateLoadPercent} />
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-4">
              {DAYS.map((day) => {
                const daySlots = weeklyTemplateByWeekday.get(day.weekday) ?? [];
                return (
                  <section key={`template-sheet-${day.weekday}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xl font-semibold tracking-wide">{day.full.toUpperCase()}</h4>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="border-dashed"
                        aria-label={`Добавить слот в ${day.full}`}
                        onClick={() => openTemplateSlotModal(day.weekday)}
                      >
                        <Plus absoluteStrokeWidth className="size-4" />
                      </Button>
                    </div>

                    {daySlots.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-5 text-center text-muted-foreground">Нет слотов</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {daySlots.map((slot) => (
                          <div
                            key={slot.id}
                            role="button"
                            tabIndex={0}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left"
                            onClick={() => openTemplateSlotModal(day.weekday, slot)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              openTemplateSlotModal(day.weekday, slot);
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium whitespace-nowrap">{formatOneHourRange(slot.start_time)}</span>
                                {sanitizeIsoDate(slot.start_from) ? (
                                  <span className="text-xs text-muted-foreground">{`с ${new Date(`${sanitizeIsoDate(slot.start_from)}T00:00:00`).toLocaleDateString('ru-RU')}`}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex min-w-0 items-center gap-2">
                              {slot.student_id ? (
                                <>
                                  <UIAvatar size="sm" className="ring-1 ring-border/40">
                                    <AvatarFallback
                                      className="font-semibold text-white"
                                      style={{
                                        backgroundColor: getStableAvatarColor(
                                          getStableAvatarSeed({
                                            id: slot.student_id,
                                            firstName: (studentNameById.get(slot.student_id) ?? '').split(/\s+/)[0] ?? null,
                                            fallbackFullName: studentNameById.get(slot.student_id) ?? null
                                          })
                                        )
                                      }}
                                    >
                                      {getStableAvatarInitial({
                                        firstName: (studentNameById.get(slot.student_id) ?? '').split(/\s+/)[0] ?? null,
                                        fallbackFullName: studentNameById.get(slot.student_id) ?? null
                                      })}
                                    </AvatarFallback>
                                  </UIAvatar>
                                  <span className="truncate text-sm text-sky-800">
                                    {studentNameById.get(slot.student_id) ?? 'Ученик не найден'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">Без ученика</span>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Удалить слот из шаблона"
                              onClick={(event) => {
                                event.stopPropagation();
                                void removeTemplateSlot(slot.id);
                              }}
                            >
                              <CircleX absoluteStrokeWidth className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(rescheduleState)} onOpenChange={(open) => !open && setRescheduleState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести занятие</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Дата</span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="w-[200px]"
                  value={rescheduleState?.date ?? ''}
                  onChange={(event) => applyRescheduleDate(event.target.value)}
                />
                <div className="flex items-center gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-r-none border-r-0"
                    aria-label="Предыдущий день"
                    disabled={!rescheduleState?.date}
                    onClick={() => {
                      const currentDate = parseIsoDateToDate(rescheduleState?.date ?? null);
                      if (!currentDate) return;
                      applyRescheduleDate(toIsoDate(addDays(currentDate, -1)));
                    }}
                  >
                    <ArrowLeft absoluteStrokeWidth className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-l-none"
                    aria-label="Следующий день"
                    disabled={!rescheduleState?.date}
                    onClick={() => {
                      const currentDate = parseIsoDateToDate(rescheduleState?.date ?? null);
                      if (!currentDate) return;
                      applyRescheduleDate(toIsoDate(addDays(currentDate, 1)));
                    }}
                  >
                    <ArrowRight absoluteStrokeWidth className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Время</span>
              <div className="grid grid-cols-6 gap-2">
                {HOURLY_TIME_OPTIONS.map((option) => {
                  const isOccupied = rescheduleOccupiedTimes.has(option.value);
                  const isActive = rescheduleState?.time === option.value;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      className={isOccupied ? 'h-12 cursor-not-allowed opacity-60' : 'h-12 cursor-pointer'}
                      disabled={isOccupied}
                      onClick={() => setRescheduleState((prev) => (prev ? { ...prev, time: option.value } : prev))}
                    >
                      {isOccupied ? (
                        <span className="flex flex-col leading-tight">
                          <span>{option.label}</span>
                          <span className="text-[10px]">Занято</span>
                        </span>
                      ) : (
                        option.label
                      )}
                    </Button>
                  );
                })}
              </div>
              {HOURLY_TIME_OPTIONS.every((option) => rescheduleOccupiedTimes.has(option.value)) ? (
                <p className="text-xs text-muted-foreground">На эту дату все часы уже заняты.</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Причина переноса</span>
              <RadioGroup
                value={rescheduleState?.reason ?? RESCHEDULE_REASONS[0]}
                onValueChange={(value) => setRescheduleState((prev) => (prev ? { ...prev, reason: value } : prev))}
              >
                {RESCHEDULE_REASONS.map((reason) => (
                  <label key={reason} className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value={reason} />
                    <span>{reason}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setRescheduleState(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => void submitReschedule()}
              disabled={
                !rescheduleState?.reason?.trim() ||
                statusUpdatingSlotId === rescheduleState?.slotId ||
                rescheduleOccupiedTimes.has(rescheduleState?.time ?? '')
              }
            >
              Сохранить перенос
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelState)} onOpenChange={(open) => !open && setCancelState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить занятие</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Причина отмены</span>
            <RadioGroup
              value={cancelState?.reason ?? RESCHEDULE_REASONS[0]}
              onValueChange={(value) => setCancelState((prev) => (prev ? { ...prev, reason: value } : prev))}
            >
              {RESCHEDULE_REASONS.map((reason) => (
                <label key={reason} className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value={reason} />
                  <span>{reason}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelState(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => void submitCancel()}
              disabled={!cancelState?.reason?.trim() || statusUpdatingSlotId === cancelState?.slotId}
            >
              Сохранить отмену
            </Button>
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
    startFrom: null,
    studentId: null,
    repeatWeekly: true
  };
}

function statusLabel(status: LessonStatus): string {
  if (status === 'completed') return 'Завершено';
  if (status === 'overdue') return 'Просрочено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'canceled') return 'Отменено';
  return 'Запланировано';
}

function statusBadgeClass(status: LessonStatus): string {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (status === 'overdue') return 'bg-orange-100 text-orange-800 border border-orange-200';
  if (status === 'rescheduled') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (status === 'canceled') return 'bg-rose-100 text-rose-800 border border-rose-200';
  return 'bg-slate-100 text-slate-800 border border-slate-200';
}

function getSlotSortKey(date: string, startTime: string): string {
  return `${date} ${startTime}`;
}

function formatOneHourRange(startTime: string): string {
  const [hoursRaw, minutesRaw] = startTime.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return `${startTime} — ${startTime}`;

  const startTotalMinutes = hours * 60 + minutes;
  const endTotalMinutes = (startTotalMinutes + 60) % (24 * 60);
  const endHours = String(Math.floor(endTotalMinutes / 60)).padStart(2, '0');
  const endMinutes = String(endTotalMinutes % 60).padStart(2, '0');
  return `${startTime} — ${endHours}:${endMinutes}`;
}

function sanitizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

function formatDayMonthRu(value: string | null | undefined): string {
  if (!value) return '—';
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;

  const dayMonth = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(date);

  const weekdayShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getUTCDay()] ?? '';
  return `${weekdayShort}, ${dayMonth}`;
}

function parseIsoDateToDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function clampWeekStart(date: Date): Date {
  const minDate = parseIsoDateToDate(JOURNAL_MIN_WEEK_START_ISO);
  if (!minDate) return date;
  return date < minDate ? minDate : date;
}

function getWeekdayFromIsoDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return ((date.getDay() + 6) % 7) + 1;
}

function getCurrentMskIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function isFutureMskDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value > getCurrentMskIsoDate();
}

function getOccupiedTimesForDay(
  weekday: number,
  date: string,
  weeklyTemplate: WeeklySlot[],
  slotMapByDate: Map<string, LessonSlot[]>
): Set<string> {
  const occupied = new Set<string>();

  for (const slot of weeklyTemplate) {
    if (slot.weekday === weekday && slot.is_active === 1) {
      occupied.add(slot.start_time);
    }
  }

  for (const slot of slotMapByDate.get(date) ?? []) {
    occupied.add(slot.start_time);
  }

  return occupied;
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

function withIdempotencyHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Idempotency-Key', crypto.randomUUID());

  return {
    ...init,
    headers
  };
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
