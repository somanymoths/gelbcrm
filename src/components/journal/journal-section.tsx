'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, CalendarDays, CircleArrowRight, CircleX, Ellipsis, Loader, Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar as UIAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Calendar } from '@/components/ui/calendar';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { DateRange } from 'react-day-picker';
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
import { formatRub } from '@/lib/payments/format';
import { toast } from 'sonner';

type RoleUser = { id: string; role: 'admin' | 'teacher'; login: string };
type TeacherItem = { id: string; full_name: string };
type StudentItem = { id: string; full_name: string; paid_lessons_left: number; last_confirmed_lesson_date: string | null };
type WeeklySlot = {
  id: string;
  weekday: number;
  start_time: string;
  start_from: string | null;
  is_active: 0 | 1;
  student_id?: string | null;
};
type LessonStatus =
  | 'planned'
  | 'overdue'
  | 'completed'
  | 'rescheduled'
  | 'canceled'
  | 'teacher_vacation'
  | 'student_vacation'
  | 'holidays';
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
  reschedule_source_slot_id?: string | null;
  reschedule_source_date?: string | null;
  reschedule_source_time?: string | null;
  lock_version: number;
  status_changed_by_login: string | null;
  status_changed_at: string | null;
  status_reason?: string | null;
  has_earlier_unconfirmed?: boolean;
  earlier_unconfirmed_date?: string | null;
  source_weekly_slot_id?: string | null;
};
type PlannedForecastBaseline = { student_id: string; planned_count: number };
type WeeklyKpiMetric = { amount: number; count: number };
type WeeklyKpi = { forecast: WeeklyKpiMetric; fact: WeeklyKpiMetric; cancellations: WeeklyKpiMetric };
type WeekSlotsResponse = { slots: LessonSlot[]; baseline: PlannedForecastBaseline[]; weeklyKpi: WeeklyKpi };
type JournalBootstrapResponse = {
  me: RoleUser;
  teachers: TeacherItem[];
  selectedTeacherId: string | null;
  students: StudentItem[];
  weeklyTemplate: WeeklySlot[];
  slotsPayload: WeekSlotsResponse;
};
type JournalViewMode = 'week' | 'month';
type VacationType = 'teacher' | 'student' | 'holidays';
type VacationHistoryStatus = 'planned' | 'active' | 'completed' | 'canceled';
type VacationModificationType = 'cancel' | 'early_finish' | null;
type VacationPreviewSlot = {
  slotId: string;
  date: string;
  startTime: string;
  studentId: string | null;
  studentFullName: string | null;
};
type VacationHistoryItem = {
  id: string;
  type: VacationType;
  dateFrom: string;
  dateTo: string;
  effectiveDateTo: string;
  status: VacationHistoryStatus;
  comment: string | null;
  createdAt: string;
  createdByLogin: string | null;
  modifiedAt: string | null;
  modifiedByLogin: string | null;
  modificationType: VacationModificationType;
  affectedStudents: Array<{ id: string; fullName: string }>;
  appliedSlotsCount: number;
};
type VacationHistoryResponse = {
  items: VacationHistoryItem[];
  total: number;
  nextOffset: number | null;
};
type VacationPreviewResponse = {
  impactedSlots: VacationPreviewSlot[];
};

type DayDraft = {
  time: string;
  startFrom: string | null;
  studentId: string | null;
  repeatWeekly: boolean;
};
type QuarterMinute = '00' | '15' | '30' | '45';

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
const JOURNAL_VIEW_MODE_STORAGE_KEY = 'gelbcrm:journal:viewMode';
const JOURNAL_MIN_WEEK_START_ISO = '2025-12-29';
const WEEK_SLOTS_CACHE_TTL_MS = 5 * 60_000;
const HOURLY_TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { value, label: value };
});
const QUARTER_MINUTE_OPTIONS: QuarterMinute[] = ['00', '15', '30', '45'];
const QUARTER_TIME_GRID = HOURLY_TIME_OPTIONS.flatMap((option) =>
  QUARTER_MINUTE_OPTIONS.map((minute) => withMinuteOffset(option.value, minute))
);
const RESCHEDULE_REASONS = ['По причине ученика', 'По причине учителя'] as const;
const VACATION_HISTORY_PAGE_SIZE = 20;
const VACATION_STATUS_COLOR_CLASS = 'bg-violet-100 text-violet-800 border border-violet-200';

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
  const [weeklyKpi, setWeeklyKpi] = useState<WeeklyKpi>(createEmptyWeeklyKpi());
  const [viewMode, setViewMode] = useState<JournalViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => clampWeekStart(getWeekStart(new Date())));
  const [monthStart, setMonthStart] = useState(() => getMonthStart(new Date()));
  const [focusedWeekDayIso, setFocusedWeekDayIso] = useState<string | null>(null);
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
  const [vacationsOpen, setVacationsOpen] = useState(false);
  const [vacationsTab, setVacationsTab] = useState<'assign' | 'history'>('assign');
  const [vacationType, setVacationType] = useState<VacationType>('teacher');
  const [vacationDateFrom, setVacationDateFrom] = useState('');
  const [vacationDateTo, setVacationDateTo] = useState('');
  const [vacationComment, setVacationComment] = useState('');
  const [vacationSelectedStudentIds, setVacationSelectedStudentIds] = useState<string[]>([]);
  const [vacationPreviewLoading, setVacationPreviewLoading] = useState(false);
  const [vacationPreviewError, setVacationPreviewError] = useState<string | null>(null);
  const [vacationPreviewSlots, setVacationPreviewSlots] = useState<VacationPreviewSlot[]>([]);
  const [vacationFormError, setVacationFormError] = useState<{ student?: string; period?: string } | null>(null);
  const [vacationSubmitting, setVacationSubmitting] = useState(false);
  const [vacationConfirmOpen, setVacationConfirmOpen] = useState(false);
  const [vacationConfirmError, setVacationConfirmError] = useState<string | null>(null);
  const [vacationHistoryItems, setVacationHistoryItems] = useState<VacationHistoryItem[]>([]);
  const [vacationHistoryTotal, setVacationHistoryTotal] = useState(0);
  const [vacationHistoryOffset, setVacationHistoryOffset] = useState<number | null>(0);
  const [vacationHistoryLoading, setVacationHistoryLoading] = useState(false);
  const [vacationHistoryLoadingMore, setVacationHistoryLoadingMore] = useState(false);
  const [vacationHistoryError, setVacationHistoryError] = useState<string | null>(null);
  const [vacationActionLoadingId, setVacationActionLoadingId] = useState<string | null>(null);
  const [vacationCancelConfirm, setVacationCancelConfirm] = useState<{
    id: string;
    rollbackCount: number;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [vacationEarlyFinishState, setVacationEarlyFinishState] = useState<{
    id: string;
    minDate: string;
    maxDate: string;
    selectedDate: string;
    rollbackCount: number | null;
    loadingPreview: boolean;
    submitting: boolean;
    error: string | null;
  } | null>(null);
  const studentsCacheRef = useRef<Map<string, { ts: number; data: StudentItem[] }>>(new Map());
  const weeklyTemplateCacheRef = useRef<Map<string, { ts: number; data: WeeklySlot[] }>>(new Map());
  const weekSlotsCacheRef = useRef<Map<string, { ts: number; data: WeekSlotsResponse }>>(new Map());
  const roleUserCacheRef = useRef<{ ts: number; data: RoleUser } | null>(null);
  const teachersCacheRef = useRef<{ ts: number; data: TeacherItem[] } | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const softRefreshTimerRef = useRef<number | null>(null);
  const weekColumnsScrollRef = useRef<HTMLDivElement | null>(null);
  const weekDayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
    return error instanceof Error && error.message.includes('Занятие уже изменено');
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

  const applyTemplateTimeToVisibleSlots = useCallback((slotId: string, nextStartTime: string) => {
    const todayMsk = getCurrentMskIsoDate();
    setSlots((prev) => {
      let changed = false;
      const next = prev
        .map((slot) => {
          if (slot.source_weekly_slot_id !== slotId) return slot;
          if (slot.date < todayMsk) return slot;
          if (slot.status !== 'planned' && slot.status !== 'overdue') return slot;
          if (slot.start_time === nextStartTime) return slot;
          changed = true;
          return { ...slot, start_time: nextStartTime };
        })
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.start_time.localeCompare(b.start_time);
        });
      return changed ? next : prev;
    });
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
  const isCurrentMonthSelected = useMemo(() => {
    return toIsoDate(monthStart) === toIsoDate(getMonthStart(new Date()));
  }, [monthStart]);

  const weekRangeLabel = useMemo(() => {
    const weekEnd = addDays(weekStart, 6);
    const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
    return `${formatter.format(weekStart)} — ${formatter.format(weekEnd)}`;
  }, [weekStart]);
  const monthRangeLabel = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(monthStart);
  }, [monthStart]);
  const periodLabel = viewMode === 'week' ? weekRangeLabel : capitalizeFirst(monthRangeLabel);

  const periodRange = useMemo(() => {
    if (viewMode === 'week') {
      return { dateFrom: toIsoDate(weekStart), dateTo: toIsoDate(addDays(weekStart, 6)), isWeekMode: true };
    }

    const monthEnd = getMonthEnd(monthStart);
    return { dateFrom: toIsoDate(monthStart), dateTo: toIsoDate(monthEnd), isWeekMode: false };
  }, [monthStart, viewMode, weekStart]);

  const refreshPeriodData = useCallback(async (teacherId: string, options?: { syncRange?: boolean; signal?: AbortSignal }) => {
    const { dateFrom, dateTo } = periodRange;

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

    weekSlotsCacheRef.current.set(getWeekSlotsCacheKey(teacherId, dateFrom, dateTo), {
      ts: Date.now(),
      data: payload
    });

    setSlots(payload.slots);
    setPlannedBaselineByStudentId(
      Object.fromEntries(payload.baseline.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))]))
    );
    setWeeklyKpi(normalizeWeeklyKpi(payload.weeklyKpi));
  }, [periodRange]);

  const prefetchPeriodData = useCallback(
    async (teacherId: string, baseDate: Date, mode: JournalViewMode, signal?: AbortSignal) => {
      const dateFrom = mode === 'week' ? toIsoDate(baseDate) : toIsoDate(getMonthStart(baseDate));
      const dateTo = mode === 'week' ? toIsoDate(addDays(baseDate, 6)) : toIsoDate(getMonthEnd(baseDate));
      const cacheKey = getWeekSlotsCacheKey(teacherId, dateFrom, dateTo);
      const cached = weekSlotsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts <= WEEK_SLOTS_CACHE_TTL_MS) return;

      try {
        const payload = await fetchJson<WeekSlotsResponse>(
          `/api/v1/journal/slots?teacherId=${encodeURIComponent(teacherId)}&dateFrom=${dateFrom}&dateTo=${dateTo}&includeBaseline=1`,
          { signal }
        );
        weekSlotsCacheRef.current.set(cacheKey, { ts: Date.now(), data: payload });
      } catch {
        // Ignore prefetch failures: they should never block navigation.
      }
    },
    []
  );

  const scheduleSoftRefresh = useCallback((teacherId?: string | null) => {
    const targetTeacherId = teacherId ?? selectedTeacherId;
    if (!targetTeacherId) return;
    if (softRefreshTimerRef.current) {
      window.clearTimeout(softRefreshTimerRef.current);
    }
    softRefreshTimerRef.current = window.setTimeout(() => {
      void refreshPeriodData(targetTeacherId, { syncRange: false });
    }, 250);
  }, [refreshPeriodData, selectedTeacherId]);

  const loadAll = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    try {
      const now = Date.now();
      const { dateFrom, dateTo, isWeekMode } = periodRange;
      const persistedTeacherId = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_JOURNAL_TEACHER_STORAGE_KEY) : null;
      const requestedTeacherId = selectedTeacherId ?? persistedTeacherId ?? null;
      const requestedCacheKey = requestedTeacherId ? getWeekSlotsCacheKey(requestedTeacherId, dateFrom, dateTo) : null;
      const cachedPeriod = requestedCacheKey ? weekSlotsCacheRef.current.get(requestedCacheKey) : null;
      const hasFreshCachedPeriod = Boolean(cachedPeriod && Date.now() - cachedPeriod.ts <= WEEK_SLOTS_CACHE_TTL_MS);

      if (hasFreshCachedPeriod && cachedPeriod) {
        setSlots(cachedPeriod.data.slots);
        setPlannedBaselineByStudentId(
          Object.fromEntries(cachedPeriod.data.baseline.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))]))
        );
        setWeeklyKpi(normalizeWeeklyKpi(cachedPeriod.data.weeklyKpi));
      }

      const query = new URLSearchParams({
        dateFrom,
        dateTo,
        syncRange: !hasFreshCachedPeriod || !isWeekMode ? '1' : '0'
      });
      if (requestedTeacherId) query.set('teacherId', requestedTeacherId);

      const bootstrap = await fetchJson<JournalBootstrapResponse>(`/api/v1/journal/bootstrap?${query.toString()}`, {
        signal: controller.signal
      });

      roleUserCacheRef.current = { ts: now, data: bootstrap.me };
      teachersCacheRef.current = { ts: now, data: bootstrap.teachers };
      setRoleUser(bootstrap.me);
      setTeacherProfileMissing(false);
      setTeachers(bootstrap.teachers);

      const nextTeacherId = bootstrap.selectedTeacherId;
      setSelectedTeacherId(nextTeacherId);
      if (!nextTeacherId) {
        setStudents([]);
        setWeeklyTemplate([]);
        setSlots([]);
        setPlannedBaselineByStudentId({});
        setWeeklyKpi(createEmptyWeeklyKpi());
        return;
      }

      const periodCacheKey = getWeekSlotsCacheKey(nextTeacherId, dateFrom, dateTo);
      weekSlotsCacheRef.current.set(periodCacheKey, { ts: Date.now(), data: bootstrap.slotsPayload });
      studentsCacheRef.current.set(nextTeacherId, { ts: now, data: bootstrap.students });
      weeklyTemplateCacheRef.current.set(nextTeacherId, { ts: now, data: bootstrap.weeklyTemplate });
      setSlots(bootstrap.slotsPayload.slots);
      setPlannedBaselineByStudentId(
        Object.fromEntries(bootstrap.slotsPayload.baseline.map((item) => [item.student_id, Math.max(0, Number(item.planned_count ?? 0))]))
      );
      setWeeklyKpi(normalizeWeeklyKpi(bootstrap.slotsPayload.weeklyKpi));
      setStudents(bootstrap.students);
      setWeeklyTemplate(bootstrap.weeklyTemplate);

      if (viewMode === 'week') {
        void prefetchPeriodData(nextTeacherId, addDays(weekStart, -7), 'week', controller.signal);
        void prefetchPeriodData(nextTeacherId, addDays(weekStart, 7), 'week', controller.signal);
      } else {
        void prefetchPeriodData(nextTeacherId, addMonths(monthStart, -1), 'month', controller.signal);
        void prefetchPeriodData(nextTeacherId, addMonths(monthStart, 1), 'month', controller.signal);
      }
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
        setWeeklyKpi(createEmptyWeeklyKpi());
        return;
      }
      showError(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [monthStart, periodRange, prefetchPeriodData, selectedTeacherId, showError, viewMode, weekStart]);

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
    const persistedViewMode = localStorage.getItem(JOURNAL_VIEW_MODE_STORAGE_KEY);
    if (persistedViewMode === 'week' || persistedViewMode === 'month') {
      setViewMode(persistedViewMode);
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

  useEffect(() => {
    if (typeof window === 'undefined' || !weekStartHydrated) return;
    localStorage.setItem(JOURNAL_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode, weekStartHydrated]);

  useEffect(() => {
    if (!focusedWeekDayIso || viewMode !== 'week') return;
    const target = weekDayRefs.current.get(focusedWeekDayIso);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    const timer = window.setTimeout(() => setFocusedWeekDayIso(null), 3000);
    return () => window.clearTimeout(timer);
  }, [focusedWeekDayIso, viewMode, weekDays]);

  const createSlotForDay = async (weekday: number, date: string): Promise<boolean> => {
    if (!selectedTeacherId) return false;
    const draft = dayDrafts[weekday];
    if (!draft || !draft.time) return false;
    if (!draft.studentId) {
      showError('Выберите ученика');
      return false;
    }

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
    const isOneTimeSlot = !slot.source_weekly_slot_id;
    if (!isOneTimeSlot && slot.status !== 'planned' && !isRescheduledTarget) return;
    if (slot.rescheduled_to_slot_id) return;
    const ok = window.confirm('Удалить слот? Действие нельзя отменить.');
    if (!ok) return;
    // Reschedule targets can have inherited source_weekly_slot_id in API payload,
    // but physically they are standalone slots and must be removed in single mode.
    if (isRescheduledTarget) {
      void deleteSlot(slot);
      return;
    }
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
  const weekVisibleSlotsByDate = useMemo(() => {
    const map = new Map<string, LessonSlot[]>();
    for (const [dateIso, daySlots] of slotMapByDate.entries()) {
      map.set(
        dateIso,
        daySlots.filter((slot) => Boolean(slot.student_id))
      );
    }
    return map;
  }, [slotMapByDate]);
  const monthDays = useMemo(() => {
    return listMonthDays(monthStart);
  }, [monthStart]);
  const monthGridCells = useMemo(() => {
    return listMonthGrid(monthStart);
  }, [monthStart]);
  const monthSlotsByDate = useMemo(() => {
    const map = new Map<string, LessonSlot[]>();
    for (const day of monthDays) {
      const daySlots = (slotMapByDate.get(day.dateIso) ?? []).filter((slot) => Boolean(slot.student_id));
      map.set(day.dateIso, daySlots);
    }
    return map;
  }, [monthDays, slotMapByDate]);
  const isMonthDataPending = loading || !weekStartHydrated || !roleUser;

  const switchToWeekWithDate = useCallback((dateIso: string) => {
    const nextDate = parseIsoDateToDate(dateIso);
    if (!nextDate) return;
    setViewMode('week');
    setWeekStart(clampWeekStart(getWeekStart(nextDate)));
    setFocusedWeekDayIso(dateIso);
  }, []);

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
      if (slot.reschedule_source_slot_id && slot.reschedule_source_date && slot.reschedule_source_time) {
        if (map.has(slot.id)) continue;
        map.set(slot.id, {
          sourceSlotId: slot.reschedule_source_slot_id,
          sourceDate: slot.reschedule_source_date,
          sourceStartTime: slot.reschedule_source_time,
          sourceWeeklySlotId: slot.source_weekly_slot_id ?? null,
          sourceReason: slot.status_reason ?? null
        });
        continue;
      }
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

  const getMonthSlotStatusLabel = useCallback(
    (slot: LessonSlot): string => {
      if (slot.status === 'rescheduled' && slot.reschedule_target_date) {
        return 'Перенесено на';
      }
      if (rescheduledSourceByTargetSlotId.has(slot.id)) {
        return 'Перенесено с';
      }
      return statusLabel(slot.status);
    },
    [rescheduledSourceByTargetSlotId]
  );

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
  const sortedJournalStudents = useMemo(
    () => [...students].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    [students]
  );
  const vacationSelectableStudentIds = useMemo(() => sortedJournalStudents.map((student) => student.id), [sortedJournalStudents]);
  const vacationAllStudentsSelected = useMemo(() => {
    if (vacationSelectableStudentIds.length === 0) return false;
    return vacationSelectableStudentIds.every((id) => vacationSelectedStudentIds.includes(id));
  }, [vacationSelectableStudentIds, vacationSelectedStudentIds]);
  const vacationExcludedStudents = useMemo(
    () => sortedJournalStudents.filter((student) => !vacationSelectedStudentIds.includes(student.id)),
    [sortedJournalStudents, vacationSelectedStudentIds]
  );
  const vacationIncludedStudents = useMemo(
    () => sortedJournalStudents.filter((student) => vacationSelectedStudentIds.includes(student.id)),
    [sortedJournalStudents, vacationSelectedStudentIds]
  );
  const vacationPreviewCount = vacationPreviewSlots.length;
  const vacationHasZeroPreview = !vacationPreviewLoading && vacationPreviewCount === 0;
  const vacationMinStartDate = useMemo(() => addDays(new Date(), 1), []);
  const vacationSelectedRange = useMemo<DateRange | undefined>(() => {
    const from = parseIsoDateToDate(vacationDateFrom);
    const to = parseIsoDateToDate(vacationDateTo);
    if (!from && !to) return undefined;
    return {
      from: from ?? undefined,
      to: to ?? from ?? undefined
    };
  }, [vacationDateFrom, vacationDateTo]);

  const resetVacationForm = useCallback(() => {
    const tomorrow = addDays(new Date(), 1);
    const plusWeek = addDays(new Date(), 8);
    const defaultFrom = toIsoDate(tomorrow);
    const defaultTo = toIsoDate(plusWeek);
    const allStudentIds = sortedJournalStudents.map((student) => student.id);

    setVacationsTab('assign');
    setVacationType('teacher');
    setVacationDateFrom(defaultFrom);
    setVacationDateTo(defaultTo);
    setVacationComment('');
    setVacationSelectedStudentIds(allStudentIds);
    setVacationPreviewError(null);
    setVacationPreviewSlots([]);
    setVacationFormError(null);
    setVacationSubmitting(false);
    setVacationConfirmOpen(false);
    setVacationConfirmError(null);
    setVacationActionLoadingId(null);
    setVacationCancelConfirm(null);
    setVacationEarlyFinishState(null);
  }, [sortedJournalStudents]);

  const loadVacationPreview = useCallback(
    async (params: {
      type: VacationType;
      dateFrom: string;
      dateTo: string;
      selectedStudentIds: string[];
    }) => {
      if (!selectedTeacherId) return;
      setVacationPreviewLoading(true);
      setVacationPreviewError(null);
      try {
        const payload = await fetchJson<VacationPreviewResponse>('/api/v1/journal/vacations/preview', {
          method: 'POST',
          body: JSON.stringify({
            teacherId: selectedTeacherId,
            type: params.type,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            selectedStudentIds: params.selectedStudentIds
          })
        });
        setVacationPreviewSlots(payload.impactedSlots);
      } catch (error) {
        setVacationPreviewSlots([]);
        setVacationPreviewError(error instanceof Error ? error.message : 'Не удалось рассчитать пропущенные занятия');
      } finally {
        setVacationPreviewLoading(false);
      }
    },
    [selectedTeacherId]
  );

  const refreshVacationHistory = useCallback(
    async (options?: { append?: boolean }) => {
      if (!selectedTeacherId) return;
      const append = options?.append ?? false;
      const nextOffset = append ? vacationHistoryOffset : 0;
      if (append && nextOffset === null) return;

      if (append) {
        setVacationHistoryLoadingMore(true);
      } else {
        setVacationHistoryLoading(true);
        setVacationHistoryError(null);
      }

      try {
        const query = new URLSearchParams({
          teacherId: selectedTeacherId,
          limit: String(VACATION_HISTORY_PAGE_SIZE),
          offset: String(nextOffset ?? 0)
        });
        const payload = await fetchJson<VacationHistoryResponse>(`/api/v1/journal/vacations?${query.toString()}`);
        setVacationHistoryTotal(payload.total);
        setVacationHistoryOffset(payload.nextOffset);
        setVacationHistoryItems((prev) => (append ? [...prev, ...payload.items] : payload.items));
      } catch (error) {
        setVacationHistoryError(error instanceof Error ? error.message : 'Не удалось загрузить историю отпусков');
      } finally {
        if (append) {
          setVacationHistoryLoadingMore(false);
        } else {
          setVacationHistoryLoading(false);
        }
      }
    },
    [selectedTeacherId, vacationHistoryOffset]
  );

  const validateVacationForm = useCallback((): boolean => {
    const errors: { student?: string; period?: string } = {};
    const tomorrowIso = toIsoDate(addDays(new Date(), 1));

    if (!vacationDateFrom || !vacationDateTo) {
      errors.period = 'Выберите период отпуска';
    } else if (vacationDateTo < vacationDateFrom) {
      errors.period = 'Дата окончания не может быть раньше даты начала';
    } else if (vacationDateFrom < tomorrowIso) {
      errors.period = 'Дата начала отпуска должна быть не раньше завтрашнего дня';
    }

    if ((vacationType === 'teacher' || vacationType === 'holidays') && vacationSelectedStudentIds.length === 0) {
      errors.student = 'Выберите хотя бы одного ученика';
    }
    if (vacationType === 'student' && vacationSelectedStudentIds.length !== 1) {
      errors.student = 'Выберите ученика';
    }
    if (sortedJournalStudents.length === 0) {
      errors.student = 'У учителя нет учеников для назначения отпуска';
    }

    setVacationFormError(errors);
    return !errors.student && !errors.period;
  }, [sortedJournalStudents.length, vacationDateFrom, vacationDateTo, vacationSelectedStudentIds.length, vacationType]);

  const vacationSummaryText = useMemo(() => {
    if (!vacationDateFrom || !vacationDateTo) return 'Выберите период отпуска';
    const fromText = formatDayMonthLongRu(vacationDateFrom);
    const toText = formatDayMonthLongRu(vacationDateTo);

    if (vacationType === 'student') {
      const student = sortedJournalStudents.find((item) => item.id === vacationSelectedStudentIds[0]);
      const studentName = student?.full_name ?? 'выбранного ученика';
      return `С ${fromText} по ${toText} у ${studentName} не будет занятий по расписанию`;
    }

    if (vacationAllStudentsSelected) {
      return `С ${fromText} по ${toText} занятий по расписанию не будет у всех`;
    }

    if (vacationExcludedStudents.length > 0) {
      const excluded = vacationExcludedStudents.map((student) => student.full_name).join(', ');
      return `С ${fromText} по ${toText} занятий по расписанию не будет у всех, кроме ${excluded}`;
    }

    const included = vacationIncludedStudents.map((student) => student.full_name).join(', ');
    return `С ${fromText} по ${toText} занятий по расписанию не будет у: ${included}`;
  }, [
    vacationAllStudentsSelected,
    vacationDateFrom,
    vacationDateTo,
    vacationExcludedStudents,
    vacationIncludedStudents,
    vacationSelectedStudentIds,
    vacationType,
    sortedJournalStudents
  ]);

  const handleVacationSubmit = useCallback(() => {
    if (!validateVacationForm()) return;
    setVacationConfirmError(null);
    setVacationConfirmOpen(true);
  }, [validateVacationForm]);

  const handleVacationTypeChange = useCallback(
    (nextType: VacationType) => {
      setVacationType(nextType);
      setVacationPreviewError(null);
      setVacationFormError(null);
      if (nextType === 'student') {
        setVacationSelectedStudentIds([]);
        setVacationPreviewSlots([]);
        return;
      }
      setVacationSelectedStudentIds(sortedJournalStudents.map((student) => student.id));
    },
    [sortedJournalStudents]
  );

  const toggleVacationStudent = useCallback((studentId: string, checked: boolean) => {
    setVacationSelectedStudentIds((prev) => {
      if (vacationType === 'student') {
        if (!checked) return [];
        return [studentId];
      }
      if (checked) {
        return [...new Set([...prev, studentId])];
      }
      return prev.filter((id) => id !== studentId);
    });
  }, [vacationType]);

  const confirmVacationCreate = useCallback(async () => {
    if (!selectedTeacherId) return;
    setVacationSubmitting(true);
    setVacationConfirmError(null);
    try {
      await fetchJson<{ id: string; impactedCount: number }>('/api/v1/journal/vacations', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          type: vacationType,
          dateFrom: vacationDateFrom,
          dateTo: vacationDateTo,
          selectedStudentIds: vacationSelectedStudentIds,
          comment: vacationComment.trim() ? vacationComment.trim() : null
        })
      });
      setVacationHistoryTotal((prev) => prev + 1);
      setVacationsOpen(false);
      setVacationConfirmOpen(false);
      showSuccess('Отпуск назначен');
      await refreshPeriodData(selectedTeacherId, { syncRange: false });
    } catch (error) {
      setVacationConfirmError(error instanceof Error ? error.message : 'Не удалось назначить отпуск');
    } finally {
      setVacationSubmitting(false);
    }
  }, [
    refreshPeriodData,
    selectedTeacherId,
    showSuccess,
    vacationComment,
    vacationDateFrom,
    vacationDateTo,
    vacationSelectedStudentIds,
    vacationType
  ]);

  const openCancelVacationConfirm = useCallback(
    async (vacationId: string) => {
      if (!selectedTeacherId) return;
      setVacationActionLoadingId(vacationId);
      try {
        const payload = await fetchJson<{ rollbackCount: number }>(`/api/v1/journal/vacations/${encodeURIComponent(vacationId)}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            teacherId: selectedTeacherId,
            previewOnly: true
          })
        });
        setVacationCancelConfirm({ id: vacationId, rollbackCount: payload.rollbackCount, loading: false, error: null });
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Не удалось подготовить отмену отпуска');
      } finally {
        setVacationActionLoadingId(null);
      }
    },
    [selectedTeacherId, showError]
  );

  const submitCancelVacation = useCallback(async () => {
    if (!vacationCancelConfirm || !selectedTeacherId) return;
    setVacationCancelConfirm((prev) => (prev ? { ...prev, loading: true, error: null } : prev));
    try {
      await fetchJson<{ rollbackCount: number }>(`/api/v1/journal/vacations/${encodeURIComponent(vacationCancelConfirm.id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId
        })
      });
      setVacationCancelConfirm(null);
      await refreshVacationHistory();
      await refreshPeriodData(selectedTeacherId, { syncRange: false });
      showSuccess('Отпуск отменён');
    } catch (error) {
      setVacationCancelConfirm((prev) =>
        prev ? { ...prev, loading: false, error: error instanceof Error ? error.message : 'Не удалось отменить отпуск' } : prev
      );
    }
  }, [refreshPeriodData, refreshVacationHistory, selectedTeacherId, showSuccess, vacationCancelConfirm]);

  const openEarlyFinishDialog = useCallback(
    async (item: VacationHistoryItem) => {
      if (!selectedTeacherId) return;
      const todayIso = getCurrentMskIsoDate();
      const minDate = addDays(parseIsoDateToDate(todayIso) ?? new Date(), -1);
      const maxDate = addDays(parseIsoDateToDate(item.effectiveDateTo) ?? new Date(), -1);
      const minIso = toIsoDate(minDate);
      const maxIso = toIsoDate(maxDate);
      if (minIso > maxIso) return;

      setVacationEarlyFinishState({
        id: item.id,
        minDate: minIso,
        maxDate: maxIso,
        selectedDate: maxIso,
        rollbackCount: null,
        loadingPreview: true,
        submitting: false,
        error: null
      });

      try {
        const payload = await fetchJson<{ rollbackCount: number }>(`/api/v1/journal/vacations/${encodeURIComponent(item.id)}/finish`, {
          method: 'POST',
          body: JSON.stringify({
            teacherId: selectedTeacherId,
            earlyFinishDate: maxIso,
            previewOnly: true
          })
        });
        setVacationEarlyFinishState((prev) => (prev ? { ...prev, rollbackCount: payload.rollbackCount, loadingPreview: false } : prev));
      } catch (error) {
        setVacationEarlyFinishState((prev) =>
          prev
            ? {
                ...prev,
                loadingPreview: false,
                error: error instanceof Error ? error.message : 'Не удалось подготовить досрочное завершение'
              }
            : prev
        );
      }
    },
    [selectedTeacherId]
  );

  const submitEarlyFinish = useCallback(async () => {
    if (!vacationEarlyFinishState || !selectedTeacherId) return;
    setVacationEarlyFinishState((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));
    try {
      await fetchJson<{ rollbackCount: number }>(`/api/v1/journal/vacations/${encodeURIComponent(vacationEarlyFinishState.id)}/finish`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          earlyFinishDate: vacationEarlyFinishState.selectedDate
        })
      });
      setVacationEarlyFinishState(null);
      await refreshVacationHistory();
      await refreshPeriodData(selectedTeacherId, { syncRange: false });
      showSuccess('Отпуск завершён досрочно');
    } catch (error) {
      setVacationEarlyFinishState((prev) =>
        prev ? { ...prev, submitting: false, error: error instanceof Error ? error.message : 'Не удалось завершить отпуск досрочно' } : prev
      );
    }
  }, [refreshPeriodData, refreshVacationHistory, selectedTeacherId, showSuccess, vacationEarlyFinishState]);

  useEffect(() => {
    if (!vacationsOpen) return;
    resetVacationForm();
  }, [resetVacationForm, vacationsOpen]);

  useEffect(() => {
    if (!vacationsOpen) return;
    if (!selectedTeacherId) return;
    if (!vacationDateFrom || !vacationDateTo) return;
    if (vacationDateTo < vacationDateFrom) return;
    if ((vacationType === 'teacher' || vacationType === 'holidays') && vacationSelectedStudentIds.length === 0) {
      setVacationPreviewSlots([]);
      return;
    }
    if (vacationType === 'student' && vacationSelectedStudentIds.length !== 1) {
      setVacationPreviewSlots([]);
      return;
    }

    void loadVacationPreview({
      type: vacationType,
      dateFrom: vacationDateFrom,
      dateTo: vacationDateTo,
      selectedStudentIds: vacationSelectedStudentIds
    });
  }, [
    loadVacationPreview,
    selectedTeacherId,
    vacationDateFrom,
    vacationDateTo,
    vacationSelectedStudentIds,
    vacationType,
    vacationsOpen
  ]);

  useEffect(() => {
    if (!vacationsOpen || vacationsTab !== 'history' || !selectedTeacherId) return;
    void refreshVacationHistory();
  }, [refreshVacationHistory, selectedTeacherId, vacationsOpen, vacationsTab]);

  useEffect(() => {
    if (!vacationEarlyFinishState || !selectedTeacherId) return;
    if (!vacationEarlyFinishState.loadingPreview) return;

    let cancelled = false;
    void fetchJson<{ rollbackCount: number }>(`/api/v1/journal/vacations/${encodeURIComponent(vacationEarlyFinishState.id)}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: selectedTeacherId,
        earlyFinishDate: vacationEarlyFinishState.selectedDate,
        previewOnly: true
      })
    })
      .then((payload) => {
        if (cancelled) return;
        setVacationEarlyFinishState((prev) =>
          prev
            ? {
                ...prev,
                rollbackCount: payload.rollbackCount,
                loadingPreview: false
              }
            : prev
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setVacationEarlyFinishState((prev) =>
          prev
            ? {
                ...prev,
                loadingPreview: false,
                error: error instanceof Error ? error.message : 'Не удалось обновить предпросмотр'
              }
            : prev
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeacherId, vacationEarlyFinishState]);

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
    const firstStudentId = students[0]?.id ?? null;

    setDayDrafts((prev) => {
      const draft = prev[weekday] ?? createDayDraft();
      const nextTime = draft.time && !occupiedTimes.has(draft.time) ? draft.time : firstAvailableTime;
      const nextStudentId =
        draft.studentId && students.some((student) => student.id === draft.studentId) ? draft.studentId : firstStudentId;

      return {
        ...prev,
        [weekday]: {
          ...draft,
          time: nextTime,
          studentId: nextStudentId,
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

  const studentLastConfirmedDateById = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of students) {
      if (!student.last_confirmed_lesson_date) continue;
      map.set(student.id, student.last_confirmed_lesson_date);
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

  const selectedTeacherName = useMemo(() => {
    if (!selectedTeacherId) return 'Преподаватель';
    return teachers.find((item) => item.id === selectedTeacherId)?.full_name ?? 'Преподаватель';
  }, [selectedTeacherId, teachers]);
  const weeklyKpiCards = useMemo(
    () => [
      { label: 'План', metric: weeklyKpi.forecast },
      { label: 'Факт', metric: weeklyKpi.fact },
      { label: 'Отмены', metric: weeklyKpi.cancellations }
    ],
    [weeklyKpi]
  );

  const templateTotalSlots = useMemo(() => weeklyTemplate.length, [weeklyTemplate]);
  const templateAssignedSlots = useMemo(
    () => weeklyTemplate.filter((slot) => Boolean(slot.student_id)).length,
    [weeklyTemplate]
  );
  const templateLoadPercent = templateTotalSlots > 0 ? Math.round((templateAssignedSlots / templateTotalSlots) * 100) : 0;
  const templateSlotDraft = templateSlotState ? dayDrafts[templateSlotState.weekday] ?? null : null;
  const templateSlotMinAllowedStartFrom =
    templateSlotDraft?.studentId ? studentLastConfirmedDateById.get(templateSlotDraft.studentId) ?? null : null;
  const templateSelectedMinute: QuarterMinute = useMemo(
    () => normalizeQuarterMinute(templateSlotDraft?.time),
    [templateSlotDraft?.time]
  );

  const getTemplateBlockedTimesByWeekday = useCallback(
    (weekday: number, excludedSlotId?: string): Set<string> => {
      const activeTimes = (weeklyTemplateByWeekday.get(weekday) ?? [])
        .filter((slot) => slot.id !== excludedSlotId && slot.is_active === 1)
        .map((slot) => slot.start_time);

      const occupied = new Set<string>();
      for (const candidateTime of QUARTER_TIME_GRID) {
        for (const activeTime of activeTimes) {
          if (!areOneHourSlotsOverlapping(candidateTime, activeTime)) continue;
          occupied.add(candidateTime);
          break;
        }
      }
      return occupied;
    },
    [weeklyTemplateByWeekday]
  );
  const templateBlockedTimes = useMemo(() => {
    if (!templateSlotState) return new Set<string>();
    return getTemplateBlockedTimesByWeekday(templateSlotState.weekday, templateSlotState.slotId);
  }, [getTemplateBlockedTimesByWeekday, templateSlotState]);

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

    const occupiedTimes = getTemplateBlockedTimesByWeekday(weekday);
    const firstAvailableTime = (
      HOURLY_TIME_OPTIONS.map((option) => withMinuteOffset(option.value, '00')).find((time) => !occupiedTimes.has(time)) ??
      '10:00'
    );
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
    if (!templateSlotState || !selectedTeacherId) return;
    const draft = dayDrafts[templateSlotState.weekday];
    if (!draft?.time) {
      showError('Выберите время');
      return;
    }
    if (!draft.startFrom) {
      showError('Укажите дату начала занятий');
      return;
    }

    if (templateBlockedTimes.has(draft.time)) {
      showError('Выбранное время занято или пересекается с другим часовым занятием');
      return;
    }

    const exists = (weeklyTemplateByWeekday.get(templateSlotState.weekday) ?? []).some(
      (slot) => slot.start_time === draft.time && slot.id !== templateSlotState.slotId
    );
    if (exists) {
      showError('Слот с этим временем уже есть в шаблоне');
      return;
    }

    if (draft.studentId && draft.startFrom) {
      const minAllowedDate = templateSlotMinAllowedStartFrom ?? studentLastConfirmedDateById.get(draft.studentId);
      if (minAllowedDate && draft.startFrom < minAllowedDate) {
        showError(
          `Дата начала не может быть раньше ${formatIsoDateHuman(minAllowedDate)}: это дата последнего подтвержденного занятия ученика`
        );
        return;
      }
    }

    const previousTemplate = weeklyTemplate;
    const previousSlots = slots;
    const previousTemplateSlot = templateSlotState.slotId
      ? weeklyTemplate.find((slot) => slot.id === templateSlotState.slotId) ?? null
      : null;
    const optimisticSlotId = templateSlotState.slotId ?? `temp-${templateSlotState.weekday}-${draft.time}-${Date.now()}`;
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
            id: optimisticSlotId,
            weekday: templateSlotState.weekday,
            start_time: draft.time,
            start_from: draft.startFrom,
            student_id: draft.studentId,
            is_active: 1
          } as WeeklySlot
        ];

    setWeeklyTemplate(nextTemplate);
    weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: nextTemplate });
    if (templateSlotState.slotId && previousTemplateSlot?.start_time !== draft.time) {
      applyTemplateTimeToVisibleSlots(templateSlotState.slotId, draft.time);
    }
    setTemplateSlotState(null);

    try {
      if (templateSlotState.slotId) {
        const updated = await fetchJson<WeeklySlot>(
          `/api/v1/journal/weekly-template/slots/${encodeURIComponent(templateSlotState.slotId)}?teacherId=${encodeURIComponent(selectedTeacherId)}`,
          {
            ...withIdempotencyHeaders(),
            method: 'PATCH',
            body: JSON.stringify({
              weekday: templateSlotState.weekday,
              startTime: draft.time,
              startFrom: draft.startFrom,
              studentId: draft.studentId,
              isActive: true
            })
          }
        );
        setWeeklyTemplate((prev) => {
          const next = prev.map((slot) => (slot.id === templateSlotState.slotId ? updated : slot));
          weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: next });
          return next;
        });
      } else {
        const created = await fetchJson<WeeklySlot>(
          `/api/v1/journal/weekly-template/slots?teacherId=${encodeURIComponent(selectedTeacherId)}`,
          {
            ...withIdempotencyHeaders(),
            method: 'POST',
            body: JSON.stringify({
              weekday: templateSlotState.weekday,
              startTime: draft.time,
              startFrom: draft.startFrom,
              studentId: draft.studentId,
              isActive: true
            })
          }
        );
        setWeeklyTemplate((prev) => {
          const next = prev.map((slot) => (slot.id === optimisticSlotId ? created : slot));
          weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: next });
          return next;
        });
      }
      scheduleSoftRefresh(selectedTeacherId);
      showSuccess('Шаблон недели сохранен');
    } catch (error) {
      setWeeklyTemplate(previousTemplate);
      weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: previousTemplate });
      setSlots(previousSlots);
      showError(error instanceof Error ? error.message : 'Не удалось сохранить шаблон недели');
    }
  };

  const removeTemplateSlot = async (slotId: string) => {
    if (!selectedTeacherId) return;
    if (slotId.startsWith('temp-')) {
      showError('Слот еще сохраняется, попробуйте через секунду');
      return;
    }
    const previousTemplate = weeklyTemplate;
    const nextTemplate = weeklyTemplate.filter((slot) => slot.id !== slotId);
    setWeeklyTemplate(nextTemplate);
    weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: nextTemplate });

    try {
      await fetchJson<void>(
        `/api/v1/journal/weekly-template/slots/${encodeURIComponent(slotId)}?teacherId=${encodeURIComponent(selectedTeacherId)}`,
        {
          ...withIdempotencyHeaders(),
          method: 'DELETE'
        }
      );
      scheduleSoftRefresh(selectedTeacherId);
      showSuccess('Слот удален из шаблона недели');
    } catch (error) {
      setWeeklyTemplate(previousTemplate);
      weeklyTemplateCacheRef.current.set(selectedTeacherId, { ts: Date.now(), data: previousTemplate });
      showError(error instanceof Error ? error.message : 'Не удалось удалить слот из шаблона недели');
    }
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
    <div className="flex h-[100dvh] w-full flex-col gap-4 overflow-hidden">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-h-9 flex-wrap items-center gap-4">
          {loading && teachers.length === 0 ? <Skeleton className="h-9 w-[320px]" /> : null}
          {roleUser?.role === 'admin' && teachers.length > 0 ? (
            <Select
              value={selectedTeacherId ?? ''}
              onValueChange={setSelectedTeacherId}
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
          {roleUser?.role === 'teacher' ? (
            <h2 className="text-[20px] font-semibold text-foreground">
              {selectedTeacherName}
            </h2>
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
          {selectedTeacherId ? (
            <Button
              variant="outline"
              className="h-9 gap-2"
              aria-label="Добавить отпуск"
              onClick={() => setVacationsOpen(true)}
            >
              <span>Добавить отпуск</span>
            </Button>
          ) : null}
        </div>
        <div className="ml-auto flex min-h-9 flex-wrap items-center justify-end gap-2">
          {loading
            ? weeklyKpiCards.map((item) => (
                <div
                  key={`weekly-kpi-skeleton-${item.label}`}
                  className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3"
                >
                  <Skeleton className="h-3 w-9" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
              ))
            : weeklyKpiCards.map((item) => (
                <div
                  key={item.label}
                  className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-sm font-medium text-foreground">{formatWeeklyKpiAmount(item.metric)}</span>
                  <Badge variant="secondary" className="h-5 px-2 text-[11px] leading-none">
                    {item.metric.count}
                  </Badge>
                </div>
              ))}
        </div>
      </div>
      <div className="h-px w-full bg-border" />

      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold">Журнал занятий</h3>
          <Badge variant="outline">{periodLabel}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ButtonGroup className="shrink-0">
            <Button
              variant={viewMode === 'week' ? 'default' : 'outline'}
              className="h-9"
              onClick={() => setViewMode('week')}
            >
              Неделя
            </Button>
            <Button
              variant={viewMode === 'month' ? 'default' : 'outline'}
              className="h-9"
              onClick={() => {
                setMonthStart(getMonthStart(weekStart));
                setViewMode('month');
              }}
            >
              Месяц
            </Button>
          </ButtonGroup>
          <ButtonGroup className="shrink-0">
          <Button
            variant="secondary"
            size="icon-sm"
            className="h-9 w-9 hover:bg-black hover:text-white"
            disabled={viewMode === 'week' ? !canGoToPreviousWeek : false}
            aria-label={viewMode === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'}
            onClick={() => {
              if (viewMode === 'week') {
                setWeekStart(clampWeekStart(addDays(weekStart, -7)));
                return;
              }
              setMonthStart(getMonthStart(addMonths(monthStart, -1)));
            }}
          >
            <ArrowLeft absoluteStrokeWidth className="size-4" />
          </Button>
          <Button
            variant="secondary"
            className={
              (viewMode === 'week' ? isCurrentWeekSelected : isCurrentMonthSelected)
                ? 'h-9 cursor-default text-blue-600 hover:bg-secondary hover:text-blue-600'
                : 'h-9 hover:bg-black hover:text-white'
            }
            onClick={() => {
              if (viewMode === 'week') {
                setWeekStart(clampWeekStart(getWeekStart(new Date())));
                return;
              }
              setMonthStart(getMonthStart(new Date()));
            }}
          >
            {viewMode === 'week' ? 'Текущая неделя' : 'Текущий месяц'}
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            className="h-9 w-9 hover:bg-black hover:text-white"
            aria-label={viewMode === 'week' ? 'Следующая неделя' : 'Следующий месяц'}
            onClick={() => {
              if (viewMode === 'week') {
                setWeekStart(addDays(weekStart, 7));
                return;
              }
              setMonthStart(getMonthStart(addMonths(monthStart, 1)));
            }}
          >
            <ArrowRight absoluteStrokeWidth className="size-4" />
          </Button>
          </ButtonGroup>
        </div>
      </div>

      <div
        ref={weekColumnsScrollRef}
        onMouseDown={handleColumnsMouseDown}
        onMouseLeave={stopColumnsDrag}
        className={`${viewMode === 'week' ? 'min-h-0 flex-1' : 'hidden h-0'} w-full overflow-auto bg-muted/30 p-[8px] px-4 ${isDraggingColumns ? 'cursor-grabbing' : 'cursor-default'}`}
      >
        <div className="grid grid-cols-1 gap-3 lg:flex lg:min-w-max lg:items-start">
          {weekDays.map((day) => (
            <Card
              key={day.dateIso}
              ref={(node) => {
                if (!node) {
                  weekDayRefs.current.delete(day.dateIso);
                  return;
                }
                weekDayRefs.current.set(day.dateIso, node);
              }}
              data-journal-day-column
              className={`cursor-default lg:w-[360px] lg:min-w-[360px] ${
                focusedWeekDayIso === day.dateIso ? 'ring-2 ring-primary ring-offset-2 transition-shadow duration-300' : ''
              }`}
            >
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
              ) : (weekVisibleSlotsByDate.get(day.dateIso) ?? []).length === 0 ? (
                weekStartHydrated && roleUser ? (
                  <p className="text-sm text-muted-foreground">Нет слотов</p>
                ) : (
                  <div className="space-y-2 rounded-lg border border-border/50 p-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-8 w-48" />
                  </div>
                )
              ) : (
                (weekVisibleSlotsByDate.get(day.dateIso) ?? []).map((slot) => (
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
                        const hasUnconfirmedLessons =
                          !isStudentMissing &&
                          slot.status !== 'completed' &&
                          Boolean(slot.has_earlier_unconfirmed);
                        const earlierUnconfirmedDateLabel = formatDayMonthRuShort(slot.earlier_unconfirmed_date);
                        const confirmTooltip = isStudentMissing
                          ? 'Нельзя подтвердить занятие без ученика'
                          : isStudentConflict
                            ? 'У выбранного ученика уже есть занятие в это время'
                          : slot.status === 'canceled'
                              ? 'Сначала снимите отмену занятия'
                            : isStudentBalanceEmpty
                              ? 'У ученика нет оплаченных занятий'
                            : hasUnconfirmedLessons
                              ? earlierUnconfirmedDateLabel
                                ? `Есть неподтвержденное занятие ${earlierUnconfirmedDateLabel}`
                                : 'Есть неподтвержденное занятие'
                            : slot.status !== 'completed' && isFutureMskDate(slot.date)
                              ? 'Нельзя завершить занятие будущего дня'
                            : slot.status === 'completed'
                              ? slot.date < getCurrentMskIsoDate()
                                ? 'Нажмите, чтобы вернуть в «Просрочено»'
                                : 'Нажмите, чтобы вернуть в Запланировано'
                              : undefined;
                        const isVacationSlot =
                          slot.status === 'teacher_vacation' || slot.status === 'student_vacation' || slot.status === 'holidays';
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
                        const shouldShowSlotActions = !slot.rescheduled_to_slot_id && !isVacationSlot;
                        const isRescheduledTargetWithSource = isRescheduledTargetSlot && Boolean(rescheduledSource?.sourceSlotId);
                        const isClosedRescheduledTargetSlot =
                          isRescheduledTargetSlot && (slot.status === 'completed' || slot.status === 'canceled');
                        const shouldShowActionsMenu =
                          (!isRegularLesson || isRescheduledTargetSlot) && !isClosedRescheduledTargetSlot && !isVacationSlot;
                        const shouldPinActionsMenuRight = isRescheduledTargetWithSource && shouldShowActionsMenu;
                        const canDeleteSlot =
                          !slot.source_weekly_slot_id &&
                          !slot.rescheduled_to_slot_id;
                        const canDeleteReschedule = isRescheduledTargetWithSource;
                        const cancelTooltip =
                          slot.status === 'canceled'
                            ? slot.date < getCurrentMskIsoDate()
                              ? 'Нажмите, чтобы вернуть в «Просрочено»'
                              : 'Нажмите, чтобы вернуть в Запланировано'
                            : 'Отменить занятие';
                        const isConfirmSaving = confirmUpdatingSlotId === slot.id;
                        const isConfirmBlockedByRules =
                          slot.status !== 'completed' &&
                          (isStudentMissing || isStudentConflict || hasUnconfirmedLessons || isStudentBalanceEmpty || isFutureDayCompletionForbidden);
                        const isConfirmDisabled =
                          deletingSlotId === slot.id ||
                          statusUpdatingSlotId === slot.id ||
                          isConfirmSaving ||
                          slot.status === 'canceled' ||
                          isConfirmBlockedByRules;
                        const confirmToggleClass =
                          `${isRegularLesson
                            ? 'shrink-0 justify-start gap-1.5 rounded-l-none rounded-r-lg border-l border-l-border pr-[10px] pl-1.5'
                            : 'shrink-0 justify-start gap-1.5 rounded-l-none rounded-r-none border-l border-l-border border-r-0 pr-[10px] pl-1.5'} ` +
                          `${isConfirmDisabled ? 'cursor-not-allowed !opacity-40' : ''} ` +
                          `${isConfirmBlockedByRules ? '!bg-slate-100 !text-slate-400 !border-slate-300 border-dashed hover:!bg-slate-100 hover:!text-slate-400 data-[state=on]:!bg-slate-100' : ''}`;

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
                        {!isRescheduledSourceSlot && !isVacationSlot && typeof forecastPaidLessonsLeft === 'number' ? (
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
                        <div className={`flex w-full items-center ${shouldPinActionsMenuRight ? 'justify-between gap-2' : 'justify-start'}`}>
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
                              <span className={isConfirmDisabled ? 'inline-flex cursor-not-allowed' : 'inline-flex'}>
                                <Toggle
                                  variant="outline"
                                  size="sm"
                                  data-segment={isRegularLesson ? 'last' : 'middle'}
                                  pressed={slot.status === 'completed'}
                                  aria-label="Подтвердить занятие"
                                  disabled={isConfirmDisabled}
                                  onPressedChange={(pressed) =>
                                    void setStatus(slot, pressed ? 'completed' : 'planned', {
                                      studentId: effectiveStudentId ?? undefined,
                                      action: 'confirm'
                                    })
                                  }
                                  className={confirmToggleClass}
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
                              </span>
                            </TooltipTrigger>
                            {confirmTooltip ? (
                              <TooltipContent sideOffset={6}>
                                <span>{confirmTooltip}</span>
                              </TooltipContent>
                            ) : null}
                          </Tooltip>
                        </TooltipProvider>

                        {shouldShowActionsMenu && !shouldPinActionsMenuRight ? (
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
                              Редактировать
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
                        {shouldShowActionsMenu && shouldPinActionsMenuRight ? (
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
                            <DropdownMenuContent align="end">
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
                                Редактировать
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
                                Редактировать
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

      <div className={viewMode === 'month' ? 'min-h-0 flex-1 overflow-auto px-4 pb-4' : 'hidden'}>
        <TooltipProvider>
          <div className="hidden rounded-xl bg-muted/30 p-3 md:block">
            <div className="mb-2 grid grid-cols-7 gap-2">
              {DAYS.map((day) => (
                <div key={day.weekday} className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {day.short}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {isMonthDataPending
                ? monthGridCells.map((_, index) => (
                    <div
                      key={`month-loading-${index}`}
                      className="flex min-h-[140px] flex-col items-start justify-start rounded-lg border bg-background p-2"
                    >
                      <Skeleton className="mb-2 h-4 w-8" />
                      <div className="w-full space-y-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                        <Skeleton className="h-3 w-4/6" />
                      </div>
                    </div>
                  ))
                : monthGridCells.map((day, index) => {
                    if (!day) {
                      return <div key={`month-empty-${index}`} className="min-h-[140px] rounded-lg border border-dashed bg-background/40" />;
                    }
                    const daySlots = monthSlotsByDate.get(day.dateIso) ?? [];
                    const previewSlots = daySlots.slice(0, 4);
                    return (
                      <button
                        key={day.dateIso}
                        type="button"
                        className="flex min-h-[140px] flex-col items-start justify-start rounded-lg border bg-background p-2 text-left transition-colors hover:bg-muted/40"
                        onClick={() => switchToWeekWithDate(day.dateIso)}
                      >
                        <div className="mb-2 text-sm font-semibold">{day.dayOfMonth}</div>
                        <div className="space-y-1">
                          {previewSlots.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Нет занятий</p>
                          ) : (
                            previewSlots.map((slot) => (
                              <Tooltip key={slot.id}>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className={`inline-block size-2 rounded-full ${statusDotClass(slot.status)}`} />
                                    <span className="font-medium">{slot.start_time}</span>
                                    <span className="truncate">{slot.student_full_name}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={6}>
                                  <span>{getMonthSlotStatusLabel(slot)}</span>
                                </TooltipContent>
                              </Tooltip>
                            ))
                          )}
                          {daySlots.length > 4 ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-blue-600 hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                switchToWeekWithDate(day.dateIso);
                              }}
                            >
                              ещё…
                            </button>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
            </div>
          </div>
        </TooltipProvider>

        <TooltipProvider>
          <div className="space-y-2 md:hidden">
            {isMonthDataPending
              ? Array.from({ length: 6 }, (_, index) => (
                  <div key={`month-mobile-loading-${index}`} className="flex w-full flex-col rounded-lg border bg-background p-3">
                    <Skeleton className="mb-2 h-4 w-24" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-4/6" />
                    </div>
                  </div>
                ))
              : monthDays.map((day) => {
                  const daySlots = monthSlotsByDate.get(day.dateIso) ?? [];
                  return (
                    <button
                      key={day.dateIso}
                      type="button"
                      onClick={() => switchToWeekWithDate(day.dateIso)}
                      className="flex w-full flex-col items-start justify-start rounded-lg border bg-background p-3 text-left"
                    >
                      <div className="mb-2 text-sm font-semibold">
                        {formatDayMonthRu(day.dateIso)}
                      </div>
                      <div className="space-y-1">
                        {daySlots.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Нет занятий</p>
                        ) : (
                          daySlots.map((slot) => (
                            <Tooltip key={slot.id}>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className={`inline-block size-2 rounded-full ${statusDotClass(slot.status)}`} />
                                  <span className="font-medium">{slot.start_time}</span>
                                  <span className="truncate">{slot.student_full_name}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={6}>
                                <span>{getMonthSlotStatusLabel(slot)}</span>
                              </TooltipContent>
                            </Tooltip>
                          ))
                        )}
                      </div>
                    </button>
                  );
                })}
          </div>
        </TooltipProvider>
      </div>

      <Dialog open={vacationsOpen} onOpenChange={setVacationsOpen}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>Отпуска</DialogTitle>
          </DialogHeader>

          <Tabs
            value={vacationsTab}
            onValueChange={(value) => setVacationsTab(value as 'assign' | 'history')}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="assign" className="w-full">Назначить отпуск</TabsTrigger>
              <TabsTrigger value="history" className="w-full">История отпусков</TabsTrigger>
            </TabsList>

            <TabsContent value="assign" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Тип отпуска</div>
                  <ToggleGroup
                    type="single"
                    value={vacationType}
                    onValueChange={(value) => {
                      if (!value) return;
                      handleVacationTypeChange(value as VacationType);
                    }}
                    variant="outline"
                    size="sm"
                    className="grid w-full grid-cols-3"
                  >
                    <ToggleGroupItem value="teacher" className="w-full justify-center">Учитель</ToggleGroupItem>
                    <ToggleGroupItem value="student" className="w-full justify-center">Ученик</ToggleGroupItem>
                    <ToggleGroupItem value="holidays" className="w-full justify-center">Праздники</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Период отпуска</div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarDays absoluteStrokeWidth className="mr-2 size-4" />
                        {vacationDateFrom && vacationDateTo
                          ? `${formatDayMonthLongRu(vacationDateFrom)} — ${formatDayMonthLongRu(vacationDateTo)}`
                          : 'Выберите период'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        selected={vacationSelectedRange}
                        disabled={{ before: vacationMinStartDate }}
                        onSelect={(range) => {
                          const from = range?.from ? toIsoDate(range.from) : '';
                          const to = range?.to ? toIsoDate(range.to) : from;
                          setVacationDateFrom(from);
                          setVacationDateTo(to);
                          setVacationFormError((prev) => (prev ? { ...prev, period: undefined } : prev));
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {vacationFormError?.period ? (
                  <Alert variant="destructive">
                    <AlertDescription>{vacationFormError.period}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Комментарий</div>
                  <Textarea
                    value={vacationComment}
                    maxLength={500}
                    onChange={(event) => setVacationComment(event.target.value)}
                    placeholder="Комментарий (необязательно)"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">У кого не будет занятий по расписанию</div>
                  {sortedJournalStudents.length === 0 ? (
                    <Alert variant="destructive">
                      <AlertDescription>У учителя нет учеников для назначения отпуска</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="max-h-52 space-y-2 overflow-auto rounded-md border border-border/60 p-3">
                      {vacationType === 'student' ? (
                        <RadioGroup value={vacationSelectedStudentIds[0] ?? ''} onValueChange={(value) => toggleVacationStudent(value, true)}>
                          <div className="space-y-2">
                            {sortedJournalStudents.map((student) => (
                              <label key={`vacation-student-${student.id}`} className="flex items-center gap-2 text-sm">
                                <RadioGroupItem value={student.id} id={`vacation-student-radio-${student.id}`} />
                                <span>{student.full_name}</span>
                              </label>
                            ))}
                          </div>
                        </RadioGroup>
                      ) : (
                        sortedJournalStudents.map((student) => (
                          <label key={`vacation-student-${student.id}`} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={vacationSelectedStudentIds.includes(student.id)}
                              onCheckedChange={(checked) => toggleVacationStudent(student.id, checked === true)}
                              id={`vacation-student-check-${student.id}`}
                            />
                            <span>{student.full_name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}

                  {vacationFormError?.student ? (
                    <p className="text-sm text-destructive">{vacationFormError.student}</p>
                  ) : null}
                </div>

                <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">{vacationSummaryText}</div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Пропущенные занятия</span>
                    <Badge variant="secondary">{vacationPreviewCount}</Badge>
                  </div>

                  {vacationPreviewError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Ошибка расчёта</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>{vacationPreviewError}</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void loadVacationPreview({
                              type: vacationType,
                              dateFrom: vacationDateFrom,
                              dateTo: vacationDateTo,
                              selectedStudentIds: vacationSelectedStudentIds
                            })
                          }
                        >
                          Повторить
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {vacationHasZeroPreview ? (
                    <Alert>
                      <AlertDescription>0 пропущенных занятий</AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="max-h-64 overflow-auto rounded-md border border-border/60">
                    {vacationPreviewLoading ? (
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                      </div>
                    ) : vacationPreviewSlots.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">Нет пропущенных занятий</div>
                    ) : (
                      <div className="divide-y">
                        {vacationPreviewSlots.map((slot) => (
                          <div key={`vacation-preview-${slot.slotId}`} className="grid grid-cols-[1fr_auto_1fr] gap-3 p-3 text-sm">
                            <span>{formatDayMonthLongRu(slot.date)}</span>
                            <span>{slot.startTime}</span>
                            <span>{slot.studentFullName ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="text-sm text-muted-foreground">Всего отпусков: {vacationHistoryTotal}</div>

                {vacationHistoryLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : vacationHistoryError ? (
                  <Alert variant="destructive">
                    <AlertDescription className="space-y-2">
                      <p>{vacationHistoryError}</p>
                      <Button size="sm" variant="secondary" onClick={() => void refreshVacationHistory()}>
                        Повторить
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : vacationHistoryItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center">
                    <p className="text-sm font-medium">История отпусков пуста</p>
                    <p className="text-sm text-muted-foreground">Здесь будут отображаться созданные отпуска</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vacationHistoryItems.map((item) => {
                      const canCancel = item.status === 'planned';
                      const canEarlyFinish = item.status === 'active' && addDays(parseIsoDateToDate(item.effectiveDateTo) ?? new Date(), -1) >= addDays(new Date(), -1);
                      return (
                        <div key={`vacation-history-${item.id}`} className="rounded-md border border-border/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={historyStatusBadgeClass(item.status)}>{historyStatusLabel(item.status)}</Badge>
                              <Badge variant="outline">{vacationHistoryTypeLabel(item.type)}</Badge>
                            </div>
                            {(canCancel || canEarlyFinish) ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={vacationActionLoadingId === item.id}
                                  >
                                    Действия
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canCancel ? (
                                    <DropdownMenuItem onSelect={() => void openCancelVacationConfirm(item.id)}>
                                      Отменить
                                    </DropdownMenuItem>
                                  ) : null}
                                  {canEarlyFinish ? (
                                    <DropdownMenuItem onSelect={() => void openEarlyFinishDialog(item)}>
                                      Завершить досрочно
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-1 text-sm">
                            <p>
                              Период: {formatDayMonthLongRu(item.dateFrom)} — {formatDayMonthLongRu(item.effectiveDateTo)}
                            </p>
                            <p>Кто создал: {item.createdByLogin ?? '—'}</p>
                            <p>Дата создания: {formatDateTimeLongRu(item.createdAt)}</p>
                            <p>
                              Затронутые ученики:{' '}
                              {item.affectedStudents.length === 0 ? '—' : item.affectedStudents.map((student) => student.fullName).join(', ')}
                            </p>
                            <p>Затронуто занятий: {item.appliedSlotsCount}</p>
                            {item.comment ? <p>Комментарий: {item.comment}</p> : null}
                            <p className="text-muted-foreground">Применено к занятиям на момент создания</p>
                            {item.modificationType ? (
                              <p className="text-muted-foreground">
                                Изменение: {item.modificationType === 'cancel' ? 'отмена' : 'досрочное завершение'} •{' '}
                                {item.modifiedByLogin ?? '—'} • {item.modifiedAt ? formatDateTimeLongRu(item.modifiedAt) : '—'}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {vacationHistoryOffset !== null ? (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void refreshVacationHistory({ append: true })}
                      disabled={vacationHistoryLoadingMore}
                    >
                      {vacationHistoryLoadingMore ? <Loader className="mr-2 size-4 animate-spin" /> : null}
                      Показать ещё
                    </Button>
                  </div>
                ) : vacationHistoryItems.length > 0 ? (
                  <p className="text-center text-sm text-muted-foreground">Больше записей нет</p>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            {vacationsTab === 'assign' ? (
              <>
                <Button variant="secondary" onClick={() => setVacationsOpen(false)}>
                  Отмена
                </Button>
                <Button
                  onClick={handleVacationSubmit}
                  disabled={vacationPreviewLoading || Boolean(vacationPreviewError) || vacationSubmitting}
                >
                  {vacationSubmitting ? <Loader className="mr-2 size-4 animate-spin" /> : null}
                  Сохранить отпуск
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setVacationsOpen(false)}>
                Закрыть
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vacationConfirmOpen} onOpenChange={setVacationConfirmOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{`Будет затронуто ${vacationPreviewCount} занятий, продолжить?`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">{vacationSummaryText}</p>
            <p className="text-sm">Комментарий: {vacationComment.trim() ? vacationComment.trim() : '—'}</p>
            {vacationPreviewCount === 0 ? (
              <Alert>
                <AlertDescription>Будет возвращено 0 занятий</AlertDescription>
              </Alert>
            ) : null}
            <div className="max-h-72 overflow-auto rounded-md border border-border/60">
              <div className="divide-y">
                {groupPreviewSlotsByDate(vacationPreviewSlots).map((group) => (
                  <div key={`vacation-confirm-group-${group.date}`} className="p-3">
                    <p className="mb-2 text-sm font-medium">{formatDayMonthLongRu(group.date)}</p>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <div key={`vacation-confirm-slot-${item.slotId}`} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
                          <span>{item.startTime}</span>
                          <span>{item.studentFullName ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {vacationConfirmError ? (
              <Alert variant="destructive">
                <AlertDescription>{vacationConfirmError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setVacationConfirmOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => void confirmVacationCreate()} disabled={vacationSubmitting}>
              {vacationSubmitting ? <Loader className="mr-2 size-4 animate-spin" /> : null}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(vacationCancelConfirm)} onOpenChange={(open) => !open && setVacationCancelConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить отпуск?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{`Будет возвращено ${vacationCancelConfirm?.rollbackCount ?? 0} занятий в статус «Запланирован».`}</p>
            <p>Статус станет «Отменён», занятия не изменятся.</p>
            {vacationCancelConfirm?.rollbackCount === 0 ? <p className="text-muted-foreground">Будет возвращено 0 занятий</p> : null}
            {vacationCancelConfirm?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{vacationCancelConfirm.error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setVacationCancelConfirm(null)}>
              Отмена
            </Button>
            <Button onClick={() => void submitCancelVacation()} disabled={vacationCancelConfirm?.loading}>
              {vacationCancelConfirm?.loading ? <Loader className="mr-2 size-4 animate-spin" /> : null}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(vacationEarlyFinishState)} onOpenChange={(open) => !open && setVacationEarlyFinishState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Завершить досрочно</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Дата завершения</div>
              <Input
                type="date"
                min={vacationEarlyFinishState?.minDate}
                max={vacationEarlyFinishState?.maxDate}
                value={vacationEarlyFinishState?.selectedDate ?? ''}
                onChange={(event) =>
                  setVacationEarlyFinishState((prev) =>
                    prev
                      ? {
                          ...prev,
                          selectedDate: event.target.value,
                          loadingPreview: true
                        }
                      : prev
                  )
                }
              />
            </div>
            <p className="text-sm">
              {`Будет возвращено ${vacationEarlyFinishState?.rollbackCount ?? 0} занятий в статус «Запланирован».`}
            </p>
            {vacationEarlyFinishState?.rollbackCount === 0 ? <p className="text-sm text-muted-foreground">Будет возвращено 0 занятий</p> : null}
            {vacationEarlyFinishState?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{vacationEarlyFinishState.error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setVacationEarlyFinishState(null)}>
              Отмена
            </Button>
            <Button onClick={() => void submitEarlyFinish()} disabled={vacationEarlyFinishState?.submitting}>
              {vacationEarlyFinishState?.submitting ? <Loader className="mr-2 size-4 animate-spin" /> : null}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    value={dayDrafts[createSlotState.weekday]?.studentId ?? ''}
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
                      <SelectValue />
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
                (createSlotState.mode === 'create' && !(dayDrafts[createSlotState.weekday]?.studentId ?? '')) ||
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Время</span>
                  <ButtonGroup aria-label="Минуты слота">
                    {QUARTER_MINUTE_OPTIONS.map((minute) => (
                      <Button
                        key={`template-minute-${minute}`}
                        type="button"
                        size="sm"
                        variant={templateSelectedMinute === minute ? 'default' : 'outline'}
                        className="h-6 w-10"
                        onClick={() => {
                          const currentTime = dayDrafts[templateSlotState.weekday]?.time ?? '10:00';
                          const hourBase = getHourBaseTime(currentTime);
                          const nextTimeCandidate = withMinuteOffset(hourBase, minute);
                          const firstAvailableTime = HOURLY_TIME_OPTIONS
                            .map((option) => withMinuteOffset(option.value, minute))
                            .find((time) => !templateBlockedTimes.has(time));
                          const nextTime = templateBlockedTimes.has(nextTimeCandidate)
                            ? firstAvailableTime ?? ''
                            : nextTimeCandidate;

                          setDayDrafts((prev) => ({
                            ...prev,
                            [templateSlotState.weekday]: {
                              ...(prev[templateSlotState.weekday] ?? createDayDraft()),
                              time: nextTime,
                              repeatWeekly: true
                            }
                          }));
                        }}
                      >
                        :{minute}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {HOURLY_TIME_OPTIONS.map((option) => {
                    const selectedTime = dayDrafts[templateSlotState.weekday]?.time ?? '10:00';
                    const timeWithSelectedMinute = withMinuteOffset(option.value, templateSelectedMinute);
                    const isOccupied = templateBlockedTimes.has(timeWithSelectedMinute);
                    const isActive = selectedTime === timeWithSelectedMinute;

                    return (
                      <Button
                        key={timeWithSelectedMinute}
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
                              time: timeWithSelectedMinute,
                              repeatWeekly: true
                            }
                          }))
                        }
                      >
                        {timeWithSelectedMinute}
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
                  min={templateSlotMinAllowedStartFrom ?? undefined}
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
                {templateSlotMinAllowedStartFrom ? (
                  <p className="text-xs text-muted-foreground">
                    Минимальная дата: {formatIsoDateHuman(templateSlotMinAllowedStartFrom)}
                  </p>
                ) : null}
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
                                disabled={slot.id.startsWith('temp-')}
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
  if (status === 'teacher_vacation') return 'Отпуск учителя';
  if (status === 'student_vacation') return 'Отпуск ученика';
  if (status === 'holidays') return 'Праздники';
  if (status === 'completed') return 'Завершено';
  if (status === 'overdue') return 'Просрочено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'canceled') return 'Отменено';
  return 'Запланировано';
}

function statusBadgeClass(status: LessonStatus): string {
  if (status === 'teacher_vacation' || status === 'student_vacation' || status === 'holidays') {
    return VACATION_STATUS_COLOR_CLASS;
  }
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

function formatDayMonthRuShort(value: string | null | undefined): string {
  if (!value) return '';
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(date);
}

function formatDayMonthLongRu(value: string | null | undefined): string {
  if (!value) return '—';
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(date);
}

function formatDateTimeLongRu(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function vacationHistoryTypeLabel(type: VacationType): string {
  if (type === 'student') return 'Отпуск ученика';
  if (type === 'holidays') return 'Праздники';
  return 'Отпуск учителя';
}

function historyStatusLabel(status: VacationHistoryStatus): string {
  if (status === 'planned') return 'Запланирован';
  if (status === 'active') return 'Активный';
  if (status === 'canceled') return 'Отменён';
  return 'Завершён';
}

function historyStatusBadgeClass(status: VacationHistoryStatus): string {
  if (status === 'planned') return 'bg-blue-100 text-blue-800 border border-blue-200';
  if (status === 'active') return 'bg-violet-100 text-violet-800 border border-violet-200';
  if (status === 'canceled') return 'bg-slate-100 text-slate-600 border border-slate-300';
  return 'bg-slate-200 text-slate-800 border border-slate-400';
}

function groupPreviewSlotsByDate(slots: VacationPreviewSlot[]): Array<{ date: string; items: VacationPreviewSlot[] }> {
  const map = new Map<string, VacationPreviewSlot[]>();
  for (const slot of slots) {
    const bucket = map.get(slot.date) ?? [];
    bucket.push(slot);
    map.set(slot.date, bucket);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))
    }));
}

function parseIsoDateToDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDateHuman(value: string): string {
  const date = parseIsoDateToDate(value);
  if (!date) return value;
  return date.toLocaleDateString('ru-RU');
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

function normalizeQuarterMinute(time: string | null | undefined): QuarterMinute {
  if (!time) return '00';
  const minute = time.split(':')[1];
  if (minute === '15' || minute === '30' || minute === '45') return minute;
  return '00';
}

function getHourBaseTime(time: string): string {
  const hourRaw = time.split(':')[0];
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return '10:00';
  return `${String(hour).padStart(2, '0')}:00`;
}

function withMinuteOffset(hourBaseTime: string, minute: QuarterMinute): string {
  const hourRaw = hourBaseTime.split(':')[0];
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return `10:${minute}`;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function toDayMinutes(time: string): number | null {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function areOneHourSlotsOverlapping(aStartTime: string, bStartTime: string): boolean {
  const aStart = toDayMinutes(aStartTime);
  const bStart = toDayMinutes(bStartTime);
  if (aStart === null || bStart === null) return false;
  const oneHour = 60;
  return aStart < bStart + oneHour && bStart < aStart + oneHour;
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
    if (slot.status === 'canceled' || slot.status === 'rescheduled') continue;
    occupied.add(slot.start_time);
  }

  return occupied;
}

function getWeekSlotsCacheKey(teacherId: string, dateFrom: string, dateTo: string): string {
  return `${teacherId}|${dateFrom}|${dateTo}`;
}

function createEmptyWeeklyKpi(): WeeklyKpi {
  return {
    forecast: { amount: 0, count: 0 },
    fact: { amount: 0, count: 0 },
    cancellations: { amount: 0, count: 0 }
  };
}

function normalizeWeeklyKpi(value: WeeklyKpi | null | undefined): WeeklyKpi {
  if (!value) return createEmptyWeeklyKpi();

  const normalizeMetric = (metric: WeeklyKpiMetric | null | undefined): WeeklyKpiMetric => ({
    amount: Math.max(0, Number(metric?.amount ?? 0) || 0),
    count: Math.max(0, Number(metric?.count ?? 0) || 0)
  });

  return {
    forecast: normalizeMetric(value.forecast),
    fact: normalizeMetric(value.fact),
    cancellations: normalizeMetric(value.cancellations)
  };
}

function formatWeeklyKpiAmount(metric: WeeklyKpiMetric): string {
  const amount = Math.round(Math.max(0, Number(metric.amount ?? 0) || 0));
  return formatRub(amount);
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

function addMonths(value: Date, amount: number): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), 1);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function getMonthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function getMonthEnd(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function listMonthDays(monthStart: Date): Array<{ dateIso: string; dayOfMonth: number }> {
  const monthEnd = getMonthEnd(monthStart);
  const days: Array<{ dateIso: string; dayOfMonth: number }> = [];
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    days.push({ dateIso: toIsoDate(current), dayOfMonth: day });
  }
  return days;
}

function listMonthGrid(monthStart: Date): Array<{ dateIso: string; dayOfMonth: number } | null> {
  const days = listMonthDays(monthStart);
  const firstDay = monthStart;
  const firstWeekday = ((firstDay.getDay() + 6) % 7) + 1;
  const leading = Math.max(0, firstWeekday - 1);
  const baseCount = leading + days.length;
  const totalCells = baseCount > 35 ? 42 : 35;
  const trailing = Math.max(0, totalCells - baseCount);

  return [
    ...Array.from({ length: leading }, () => null),
    ...days,
    ...Array.from({ length: trailing }, () => null)
  ];
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function statusDotClass(status: LessonStatus): string {
  if (status === 'teacher_vacation' || status === 'student_vacation' || status === 'holidays') return 'bg-violet-500';
  if (status === 'completed') return 'bg-emerald-500';
  if (status === 'overdue') return 'bg-orange-500';
  if (status === 'canceled') return 'bg-rose-500';
  if (status === 'rescheduled') return 'bg-amber-500';
  return 'bg-slate-500';
}
