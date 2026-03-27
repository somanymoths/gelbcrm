'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert as UIAlert, AlertTitle } from '@/components/ui/alert';
import { Avatar as UIAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button as UIButton } from '@/components/ui/button';
import { Card as UICard, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input as UIInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { getStableAvatarColor, getStableAvatarInitial, getStableAvatarSeed } from '@/lib/avatar-color';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CloseOutlined = () => <span>✕</span>;
const CopyOutlined = () => <span>⧉</span>;
const DeleteOutlined = () => <span>🗑</span>;
const ExportOutlined = () => <span>↗</span>;
const PlusOutlined = () => <span>＋</span>;
const RedoOutlined = () => <span>↻</span>;

type FunnelStage = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

type FunnelCard = {
  id: string;
  entity_type: 'lead' | 'student';
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  contact_link: string;
  lead_source: string;
  card_comment: string | null;
  assigned_teacher_id: string | null;
  teacher_full_name: string | null;
  stage_id: number;
  stage_code: string;
  stage_name: string;
  next_lesson_at: string | null;
  overdue_lessons_count?: number;
  effective_paid_lessons_left?: number;
  start_lessons_at: string | null;
  last_lesson_at: string | null;
  paid_lessons_left: number;
  created_at: string;
  updated_at: string;
};

type FunnelAuditItem = {
  id: number;
  actor_login: string | null;
  action: string;
  diff_before: Record<string, unknown> | null;
  diff_after: Record<string, unknown> | null;
  created_at: string;
};

type LossReason = {
  id: number;
  name: string;
};

type Teacher = {
  id: string;
  full_name: string;
};

type Tariff = {
  id: string;
  name: string;
  packages: Array<{
    id: string;
    lessons_count: number;
    total_price_rub: number;
  }>;
};

type PaymentLink = {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  payment_url: string;
  amount: number;
  created_at: string;
  expires_at: string | null;
};

type ArchivedCard = FunnelCard;
type CardComment = {
  id: number;
  body: string;
  author_login: string | null;
  created_at: string;
};

type CreateFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  contact: string;
  email: string;
  leadSource: string;
  comment: string;
  startLessonsAt: string;
};

const INITIAL_CREATE_FORM: CreateFormState = {
  firstName: '',
  lastName: '',
  phone: '',
  contact: '',
  email: '',
  leadSource: '',
  comment: '',
  startLessonsAt: ''
};

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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatNextLessonDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const weekday = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()] ?? '';
  const dayMonth = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  });

  return `${weekday}, ${dayMonth}`;
}

function auditActionLabel(action: string): string {
  if (action === 'update_stage') return 'Смена этапа';
  if (action === 'manual_lessons_add') return 'Ручное добавление занятий';
  if (action === 'add_comment') return 'Комментарий';
  if (action === 'assign_teacher') return 'Назначение преподавателя';
  if (action === 'move_stage') return 'Смена этапа';
  if (action === 'archive') return 'Архивация';
  if (action === 'restore') return 'Восстановление';
  if (action === 'create') return 'Создание карточки';
  if (action === 'update') return 'Обновление карточки';
  if (action === 'payment_link_create') return 'Ссылка на оплату создана';
  if (action === 'payment_link_delete') return 'Ссылка на оплату удалена';
  return 'Системное событие';
}

function stageCodeLabel(stageCode: string | null | undefined): string {
  if (!stageCode) return 'неизвестно';
  if (stageCode === 'interested') return 'Заинтересовался';
  if (stageCode === 'qualification') return 'Квалификация';
  if (stageCode === 'acquaintance') return 'Знакомство';
  if (stageCode === 'payment') return 'Оплата';
  if (stageCode === 'studying') return 'На занятиях';
  if (stageCode === 'last_lesson') return 'Последнее занятие';
  if (stageCode === 'declined') return 'Отказался';
  if (stageCode === 'stopped') return 'Перестал заниматься';
  return stageCode;
}

function getAuditSummary(item: FunnelAuditItem): { title: string; details?: string; color: string } {
  if (item.action === 'manual_lessons_add') {
    const added = Number(item.diff_after?.lessons_added ?? 0);
    const comment = typeof item.diff_after?.comment === 'string' ? item.diff_after.comment : null;
    return {
      title: `Добавлено занятий: +${added}`,
      details: comment ?? undefined,
      color: '#d9d9f3'
    };
  }

  if (item.action === 'update_stage' || item.action === 'move_stage') {
    const stageCode = typeof item.diff_after?.stage_code === 'string' ? item.diff_after.stage_code : null;
    return {
      title: `Этап изменен: ${stageCodeLabel(stageCode)}`,
      color: '#e6e7f5'
    };
  }

  return {
    title: auditActionLabel(item.action),
    color: '#e6e7f5'
  };
}

function formatEventDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) return 'Сегодня';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatCountdown(targetDate: string | null, nowTs: number): string {
  if (!targetDate) return '—';
  const targetTs = new Date(targetDate).getTime();
  if (Number.isNaN(targetTs)) return '—';

  const diff = targetTs - nowTs - 1000;
  if (diff <= 0) return '00:00:00';

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return days > 0 ? `${days}д ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function BoardSkeleton() {
  return (
    <div className="w-full overflow-x-auto rounded-xl bg-muted/30 p-2">
      <div className="flex min-w-max items-start gap-4">
        {Array.from({ length: 4 }).map((_, columnIndex) => (
          <div key={`stage-skeleton-${columnIndex}`} className="w-[296px] min-w-[296px] flex-none">
            <UICard className="bg-card/95 ring-1 ring-border/50 shadow-sm">
              <CardHeader className="px-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-6" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex w-full flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, cardIndex) => (
                    <UICard key={`card-skeleton-${columnIndex}-${cardIndex}`} size="sm" className="bg-background/90 ring-1 ring-border/40 shadow-sm">
                      <CardContent className="px-3 pb-3">
                        <div className="flex w-full flex-col gap-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-48" />
                          <Skeleton className="h-3 w-44" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-7 w-full" />
                        </div>
                      </CardContent>
                    </UICard>
                  ))}
                </div>
              </CardContent>
            </UICard>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex min-w-0 w-full flex-col gap-4">
      <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
        <CardContent className="px-4 pb-4">
          <div className="mt-1 flex items-start gap-3">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
          <div className="mt-4">
            <Skeleton className="mb-1 h-3 w-14" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </UICard>

      {Array.from({ length: 4 }).map((_, index) => (
        <UICard key={`drawer-section-skeleton-${index}`} size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
          <CardHeader className="px-4 pb-2">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          </CardContent>
        </UICard>
      ))}
    </div>
  );
}

function ArchiveListSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <UICard key={`archive-skeleton-${index}`} size="sm" className="bg-background/80 ring-1 ring-border/40 shadow-sm">
          <CardContent className="px-3 pb-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          </CardContent>
        </UICard>
      ))}
    </div>
  );
}

export function FunnelBoard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [cards, setCards] = useState<FunnelCard[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);

  const [createForm, setCreateForm] = useState<CreateFormState>(INITIAL_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [selectedCard, setSelectedCard] = useState<FunnelCard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [auditItems, setAuditItems] = useState<FunnelAuditItem[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [cardComments, setCardComments] = useState<CardComment[]>([]);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [teacherSaving, setTeacherSaving] = useState(false);

  const [selectedTariffId, setSelectedTariffId] = useState<string | null>(null);
  const [paymentLinkCreating, setPaymentLinkCreating] = useState(false);
  const [paymentLinkDeleting, setPaymentLinkDeleting] = useState(false);
  const [manualLessonsToAdd, setManualLessonsToAdd] = useState<number>(1);
  const [manualLessonsComment, setManualLessonsComment] = useState('');
  const [manualLessonsSaving, setManualLessonsSaving] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  const [archivedCards, setArchivedCards] = useState<ArchivedCard[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [restoreStageCode, setRestoreStageCode] = useState<string | null>(null);
  const [restoreCardId, setRestoreCardId] = useState<string | null>(null);

  const [lossStageModal, setLossStageModal] = useState<{ cardId: string; stageCode: string } | null>(null);
  const [lossReasonIdForMove, setLossReasonIdForMove] = useState<number | null>(null);

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverStageCode, setDragOverStageCode] = useState<string | null>(null);
  const boardScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const preservedScrollLeftRef = useRef<number>(0);
  const shouldRestoreScrollRef = useRef(false);

  const loadBoard = useCallback(async () => {
    if (boardScrollContainerRef.current) {
      preservedScrollLeftRef.current = boardScrollContainerRef.current.scrollLeft;
      shouldRestoreScrollRef.current = true;
    }

    setLoading(true);
    setError(null);

    try {
      const [boardRes, lossReasonsRes, teachersRes, tariffsRes] = await Promise.all([
        fetch('/api/v1/funnel/board', { cache: 'no-store' }),
        fetch('/api/v1/funnel/loss-reasons', { cache: 'no-store' }),
        fetch('/api/v1/funnel/teachers', { cache: 'no-store' }),
        fetch('/api/v1/funnel/payment-tariffs', { cache: 'no-store' })
      ]);

      const failedResponse = [boardRes, lossReasonsRes, teachersRes, tariffsRes].find((response) => !response.ok);
      if (failedResponse) {
        if (failedResponse.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (failedResponse.status === 403) {
          window.location.href = '/forbidden';
          return;
        }
        const payload = (await failedResponse.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось загрузить данные воронки');
      }

      const board = (await boardRes.json()) as { stages: FunnelStage[]; cards: FunnelCard[] };
      const reasons = (await lossReasonsRes.json()) as LossReason[];
      const teachersData = (await teachersRes.json()) as Teacher[];
      const tariffsData = (await tariffsRes.json()) as Tariff[];
      setStages(board.stages);
      setCards(board.cards);
      setLossReasons(reasons);
      setTeachers(teachersData);
      setTariffs(tariffsData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && shouldRestoreScrollRef.current && boardScrollContainerRef.current) {
      boardScrollContainerRef.current.scrollLeft = preservedScrollLeftRef.current;
      shouldRestoreScrollRef.current = false;
    }
  }, [loading, cards, stages]);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const response = await fetch('/api/v1/funnel/archived', { cache: 'no-store' });
      if (!response.ok) {
        toast.error('Не удалось загрузить архив');
        return;
      }

      const data = (await response.json()) as ArchivedCard[];
      setArchivedCards(data);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const groupedCards = useMemo(() => {
    const map = new Map<string, FunnelCard[]>();

    for (const stage of stages) {
      map.set(stage.code, []);
    }

    for (const card of cards) {
      const bucket = map.get(card.stage_code);
      if (bucket) bucket.push(card);
    }

    return map;
  }, [cards, stages]);

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.full_name);
    }
    return map;
  }, [teachers]);

  const tariffOptions = useMemo(() => {
    return tariffs.map((tariff) => ({
      value: tariff.id,
      label: `${tariff.name} (${tariff.packages.length} пак.)`
    }));
  }, [tariffs]);

  const recentEvents = useMemo(() => {
    const events: Array<{ id: string; title: string; details?: string; created_at: string; color: string }> = [];

    for (const item of paymentLinks) {
      if (item.status === 'paid') {
        events.push({
          id: `payment-${item.id}`,
          title: 'Оплата подтверждена',
          created_at: item.created_at,
          color: '#b7ebd0'
        });
      }
    }

    for (const item of auditItems) {
      const summary = getAuditSummary(item);

      events.push({
        id: `audit-${item.id}`,
        title: summary.title,
        details: summary.details,
        created_at: item.created_at,
        color: summary.color
      });
    }

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return events.slice(0, 3);
  }, [auditItems, paymentLinks]);

  const activePaymentLink = useMemo(() => {
    return (
      paymentLinks.find((item) => {
        if (item.status !== 'pending') return false;
        if (!item.expires_at) return false;
        const expiresTs = new Date(item.expires_at).getTime();
        return Number.isFinite(expiresTs) && expiresTs > nowTs;
      }) ?? null
    );
  }, [paymentLinks, nowTs]);

  async function refreshSelectedCard(cardId: string) {
    const [cardRes, auditRes, linksRes, commentsRes] = await Promise.allSettled([
      fetch(`/api/v1/funnel/cards/${cardId}`, { cache: 'no-store' }),
      fetch(`/api/v1/funnel/cards/${cardId}/audit`, { cache: 'no-store' }),
      fetch(`/api/v1/funnel/cards/${cardId}/payment-links`, { cache: 'no-store' }),
      fetch(`/api/v1/funnel/cards/${cardId}/comments`, { cache: 'no-store' })
    ]);

    if (cardRes.status === 'fulfilled' && cardRes.value.ok) {
      const card = (await cardRes.value.json()) as FunnelCard;
      setSelectedCard(card);
      setSelectedTeacherId(card.assigned_teacher_id);
    }

    if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
      setAuditItems(((await auditRes.value.json()) as FunnelAuditItem[]) ?? []);
    }

    if (linksRes.status === 'fulfilled' && linksRes.value.ok) {
      setPaymentLinks(((await linksRes.value.json()) as PaymentLink[]) ?? []);
    }

    if (commentsRes.status === 'fulfilled' && commentsRes.value.ok) {
      setCardComments(((await commentsRes.value.json()) as CardComment[]) ?? []);
    }
  }

  async function openCard(cardId: string) {
    const boardCard = cards.find((item) => item.id === cardId) ?? null;
    if (boardCard) {
      setSelectedCard(boardCard);
      setSelectedTeacherId(boardCard.assigned_teacher_id);
    }
    setManualLessonsToAdd(1);
    setManualLessonsComment('');
    setShowFullHistory(false);
    setEditMode(false);
    setNewNoteBody('');

    setDrawerOpen(true);
    setDetailsLoading(true);
    setError(null);

    try {
      await refreshSelectedCard(cardId);
    } catch {
      // no-op: keep board snapshot in drawer even if detail fetch failed
    } finally {
      setDetailsLoading(false);
    }
  }

  async function onCreateCard() {
    setCreating(true);

    try {
      const payload: Record<string, string> = {
        firstName: createForm.firstName,
        lastName: createForm.lastName
      };

      if (createForm.phone.trim()) payload.phone = createForm.phone;
      if (createForm.contact.trim()) payload.contact = createForm.contact;
      if (createForm.email.trim()) payload.email = createForm.email;
      if (createForm.leadSource.trim()) payload.leadSource = createForm.leadSource;
      if (createForm.comment.trim()) payload.comment = createForm.comment;
      if (createForm.startLessonsAt.trim()) payload.startLessonsAt = createForm.startLessonsAt;

      const response = await fetch('/api/v1/funnel/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось создать карточку');
      }

      setCreateForm(INITIAL_CREATE_FORM);
      setCreateModalOpen(false);
      toast.success('Карточка создана');
      await loadBoard();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Ошибка создания карточки');
    } finally {
      setCreating(false);
    }
  }

  async function moveStage(cardId: string, stageCode: string, reasonId?: number) {
    const previousCard = cards.find((card) => card.id === cardId) ?? null;
    const nextStage = stages.find((stage) => stage.code === stageCode) ?? null;

    if (!previousCard || !nextStage || previousCard.stage_code === stageCode) {
      return;
    }

    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              stage_id: nextStage.id,
              stage_code: nextStage.code,
              stage_name: nextStage.name
            }
          : card
      )
    );

    if (selectedCard?.id === cardId) {
      setSelectedCard((prev) =>
        prev
          ? {
              ...prev,
              stage_id: nextStage.id,
              stage_code: nextStage.code,
              stage_name: nextStage.name
            }
          : prev
      );
    }

    const response = await fetch(`/api/v1/funnel/cards/${cardId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode, lossReasonId: reasonId })
    });

    if (!response.ok) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                stage_id: previousCard.stage_id,
                stage_code: previousCard.stage_code,
                stage_name: previousCard.stage_name
              }
            : card
        )
      );

      if (selectedCard?.id === cardId) {
        setSelectedCard((prev) =>
          prev
            ? {
                ...prev,
                stage_id: previousCard.stage_id,
                stage_code: previousCard.stage_code,
                stage_name: previousCard.stage_name
              }
            : prev
        );
      }

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось обновить этап');
      return;
    }

    if (selectedCard?.id === cardId) {
      await refreshSelectedCard(cardId);
    }
  }

  async function onChangeStage(cardId: string, stageCode: string) {
    if (stageCode === 'declined' || stageCode === 'stopped') {
      setLossStageModal({ cardId, stageCode });
      setLossReasonIdForMove(null);
      return;
    }

    await moveStage(cardId, stageCode);
  }

  async function onSaveDetails() {
    if (!selectedCard) return;

    const firstName = selectedCard.first_name.trim();
    const lastName = selectedCard.last_name.trim();

    if (!firstName || !lastName) {
      toast.error('Имя и фамилия обязательны');
      return;
    }

    const payload: Record<string, string | null> = {
      firstName,
      lastName
    };

    const phone = selectedCard.phone?.trim();
    const contact = selectedCard.contact_link?.trim();
    const email = selectedCard.email?.trim();
    const leadSource = selectedCard.lead_source?.trim();

    if (phone) payload.phone = phone;
    if (contact) payload.contact = contact;
    if (email) payload.email = email;
    if (leadSource) payload.leadSource = leadSource;
    if (selectedCard.start_lessons_at) payload.startLessonsAt = selectedCard.start_lessons_at;
    if (selectedCard.last_lesson_at) payload.lastLessonAt = selectedCard.last_lesson_at;

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось сохранить карточку');
      return;
    }

    toast.success('Карточка сохранена');
    await loadBoard();
    await refreshSelectedCard(selectedCard.id);
    setEditMode(false);
  }

  async function onAddManualLessons() {
    if (!selectedCard) return;

    const lessonsToAdd = Math.trunc(manualLessonsToAdd);
    const trimmedComment = manualLessonsComment.trim();

    if (!Number.isInteger(lessonsToAdd) || lessonsToAdd < 1) {
      toast.error('Укажите положительное целое количество занятий');
      return;
    }

    if (!trimmedComment) {
      toast.error('Комментарий обязателен');
      return;
    }

    setManualLessonsSaving(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/manual-lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonsToAdd, comment: trimmedComment })
    });

    setManualLessonsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось добавить занятия');
      return;
    }

    toast.success(`Добавлено ${lessonsToAdd} занятий`);
    setManualLessonsToAdd(1);
    setManualLessonsComment('');
    await loadBoard();
    await refreshSelectedCard(selectedCard.id);
  }

  async function onAddNote() {
    if (!selectedCard) return;
    const body = newNoteBody.trim();

    if (!body) {
      toast.error('Введите текст заметки');
      return;
    }

    setAddingNote(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });

    setAddingNote(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось добавить заметку');
      return;
    }

    setNewNoteBody('');
    await refreshSelectedCard(selectedCard.id);
  }

  async function onAssignTeacher() {
    if (!selectedCard) return;

    if (selectedCard.assigned_teacher_id === selectedTeacherId) return;

    setTeacherSaving(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/teacher`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: selectedTeacherId })
    });

    setTeacherSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось сохранить преподавателя');
      return;
    }

    toast.success(selectedTeacherId ? 'Преподаватель назначен' : 'Преподаватель снят');
    await loadBoard();
    await refreshSelectedCard(selectedCard.id);
  }

  async function onCreatePaymentLink() {
    if (!selectedCard || !selectedTariffId) return;

    setPaymentLinkCreating(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/payment-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tariffGridId: selectedTariffId })
    });

    setPaymentLinkCreating(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;
      if (payload?.code === 'ACTIVE_PAYMENT_LINK_EXISTS') {
        toast.error(payload.message ?? 'У ученика уже есть активная ссылка');
        await refreshSelectedCard(selectedCard.id);
        return;
      }
      toast.error(payload?.message ?? 'Не удалось создать ссылку оплаты');
      return;
    }

    const payload = (await response.json()) as { confirmationUrl: string };
    toast.success('Ссылка на оплату создана');

    if (payload.confirmationUrl) {
      window.open(payload.confirmationUrl, '_blank', 'noopener,noreferrer');
    }

    await refreshSelectedCard(selectedCard.id);
  }

  async function onCopyPaymentLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  }

  async function onRefreshPaymentLink() {
    if (!selectedCard || !activePaymentLink) return;

    setPaymentLinkCreating(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/payment-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshActive: true })
    });

    setPaymentLinkCreating(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось обновить ссылку оплаты');
      return;
    }

    const payload = (await response.json()) as { confirmationUrl?: string };
    toast.success('Ссылка оплаты обновлена');

    if (payload.confirmationUrl) {
      window.open(payload.confirmationUrl, '_blank', 'noopener,noreferrer');
    }

    await refreshSelectedCard(selectedCard.id);
  }

  async function onDeleteActivePaymentLink() {
    if (!selectedCard || !activePaymentLink) return;

    setPaymentLinkDeleting(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/payment-links`, {
      method: 'DELETE'
    });

    setPaymentLinkDeleting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось удалить активную ссылку');
      return;
    }

    toast.success('Активная ссылка удалена');
    await refreshSelectedCard(selectedCard.id);
  }

  async function onArchiveSelectedCard() {
    if (!selectedCard) return;

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/archive`, { method: 'POST' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось архивировать карточку');
      return;
    }

    toast.success('Карточка архивирована');
    setDrawerOpen(false);
    setSelectedCard(null);
    await loadBoard();
  }

  async function onOpenArchive() {
    setArchivedCards([]);
    await loadArchived();
    setArchiveModalOpen(true);
    setRestoreCardId(null);
    setRestoreStageCode(null);
  }

  async function onRestoreCard() {
    if (!restoreCardId || !restoreStageCode) {
      toast.error('Выберите карточку и этап восстановления');
      return;
    }

    const response = await fetch(`/api/v1/funnel/cards/${restoreCardId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode: restoreStageCode })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? 'Не удалось восстановить карточку');
      return;
    }

    toast.success('Карточка восстановлена');
    setArchiveModalOpen(false);
    await loadBoard();
  }

  function closeCardDrawer() {
    setDrawerOpen(false);
    setSelectedCard(null);
    setManualLessonsToAdd(1);
    setManualLessonsComment('');
    setShowFullHistory(false);
    setEditMode(false);
    setNewNoteBody('');
  }

  function confirmLossStageMove() {
    if (!lossStageModal || !lossReasonIdForMove) {
      toast.error('Выберите причину');
      return;
    }

    void moveStage(lossStageModal.cardId, lossStageModal.stageCode, lossReasonIdForMove);
    setLossStageModal(null);
    setLossReasonIdForMove(null);
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="space-y-1">
        <h2 className="mb-2 font-heading text-2xl font-semibold tracking-tight">
          Воронка
        </h2>
        <span className="text-sm text-muted-foreground">
          Управление лидами/учениками по этапам с учётом оплат, истории изменений и архива.
        </span>
      </div>

      <UICard className="bg-card/95 ring-1 ring-border/50 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <UIButton variant="default" onClick={() => setCreateModalOpen(true)}>
              Создать карточку
            </UIButton>
            <UIButton onClick={() => void loadBoard()}>Обновить</UIButton>
            <UIButton onClick={() => void onOpenArchive()}>Архив карточек</UIButton>
          </div>
          <Badge variant="secondary">{cards.length} карточек</Badge>
        </CardContent>
      </UICard>

      {error ? (
        <UIAlert className="bg-destructive/10 text-destructive ring-1 ring-destructive/20">
          <AlertTitle>{error}</AlertTitle>
        </UIAlert>
      ) : null}

      {loading ? (
        <BoardSkeleton />
      ) : (
        <div ref={boardScrollContainerRef} className="w-full overflow-x-auto rounded-xl bg-muted/30 p-2">
          <div className="flex min-w-max items-start gap-4">
            {stages.map((stage) => {
            const stageCards = groupedCards.get(stage.code) ?? [];
            const isActiveDropZone = draggedCardId !== null && dragOverStageCode === stage.code;

            return (
              <div key={stage.id} className="w-[296px] min-w-[296px] flex-none">
                <UICard
                  className={cn(
                    'bg-card/95 ring-1 ring-border/50 shadow-sm transition-shadow',
                    isActiveDropZone && 'ring-2 ring-primary/40'
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverStageCode !== stage.code) setDragOverStageCode(stage.code);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOverStageCode(null);
                    if (draggedCardId) {
                      void onChangeStage(draggedCardId, stage.code);
                    }
                  }}
                >
                  <CardHeader className="px-4 pb-3">
                    <CardTitle className="text-base">{stage.name}</CardTitle>
                    <CardAction>
                      <span className="text-muted-foreground">{stageCards.length}</span>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex w-full flex-col gap-2">
                    {stageCards.map((card) => (
                      <UICard
                        key={card.id}
                        size="sm"
                        className="cursor-pointer bg-background/90 ring-1 ring-border/40 shadow-sm transition-shadow hover:shadow-md"
                        draggable
                        style={{
                          cursor: 'grab',
                          opacity: draggedCardId === card.id ? 0.5 : 1
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', card.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggedCardId(card.id);
                        }}
                        onDragEnd={() => {
                          setDraggedCardId(null);
                          setDragOverStageCode(null);
                        }}
                        onClick={() => void openCard(card.id)}
                      >
                        <CardContent className="px-3 pb-3">
                          <div className="flex w-full flex-col gap-2">
                          <span className="font-semibold">
                            {formatPersonName({
                              firstName: card.first_name,
                              lastName: card.last_name,
                              fallbackFullName: card.full_name
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Преподаватель:{' '}
                            {card.assigned_teacher_id
                              ? teacherNameById.get(card.assigned_teacher_id) ?? card.teacher_full_name ?? 'Не назначен'
                              : 'Не назначен'}
                          </span>
                          <span className="text-xs text-muted-foreground">Следующее занятие: {formatNextLessonDate(card.next_lesson_at)}</span>
                          <span className="text-xs text-muted-foreground">Осталось занятий: {card.paid_lessons_left}</span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              card.entity_type === 'student' && 'bg-emerald-100 text-emerald-800',
                              card.entity_type !== 'student' && 'bg-blue-100 text-blue-800'
                            )}
                          >
                            {card.entity_type === 'student' ? 'Ученик' : 'Лид'}
                          </Badge>
                          <NativeSelect
                            value={card.stage_code}
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => void onChangeStage(card.id, event.target.value)}
                          >
                            {stages.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </NativeSelect>
                          </div>
                        </CardContent>
                      </UICard>
                    ))}

                    {stageCards.length === 0 ? (
                      <div
                        className={cn(
                          'flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/30 p-3 text-center',
                          isActiveDropZone && 'border-primary bg-primary/10 text-primary'
                        )}
                      >
                        <span className={cn(!isActiveDropZone && 'text-muted-foreground')}>
                          {draggedCardId ? 'Отпустите карточку, чтобы переместить сюда' : 'Нет карточек'}
                        </span>
                      </div>
                    ) : null}
                    </div>
                  </CardContent>
                </UICard>
              </div>
            );
            })}
          </div>
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={(nextOpen) => !nextOpen && closeCardDrawer()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-[680px] p-0 sm:max-w-[680px]"
        >
          <SheetTitle className="sr-only">Карточка ученика</SheetTitle>
          <SheetClose asChild>
            <UIButton
              variant="outline"
              size="icon-sm"
              aria-label="Закрыть карточку"
              className="absolute top-4 -left-12 z-50 bg-background shadow-sm"
            >
              <CloseOutlined />
            </UIButton>
          </SheetClose>
          <div className="h-full overflow-auto overflow-x-hidden bg-muted/20 p-4 sm:p-5">
            {detailsLoading || !selectedCard ? (
              <DrawerSkeleton />
            ) : (
              <div className="flex min-w-0 w-full flex-col gap-4">
                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardContent className="px-4 pb-4">
                    <div className="mt-1 flex items-start gap-3">
                      <UIAvatar className="size-14 ring-1 ring-border/50">
                        <AvatarFallback
                          className="text-xl font-semibold text-white"
                          style={{
                            backgroundColor: getStableAvatarColor(
                              getStableAvatarSeed({
                                id: selectedCard.id,
                                firstName: selectedCard.first_name,
                                fallbackFullName: selectedCard.full_name
                              })
                            )
                          }}
                        >
                          {getStableAvatarInitial({
                            firstName: selectedCard.first_name,
                            fallbackFullName: selectedCard.full_name
                          })}
                        </AvatarFallback>
                      </UIAvatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-lg font-semibold leading-tight">
                          {formatPersonName({
                            firstName: selectedCard.first_name,
                            lastName: selectedCard.last_name,
                            fallbackFullName: selectedCard.full_name
                          })}
                        </span>
                        <span className="break-all text-sm text-muted-foreground">
                          {selectedCard.contact_link || 'Контакт не указан'}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              selectedCard.entity_type === 'student' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            )}
                          >
                            {selectedCard.entity_type === 'student' ? 'Ученик' : 'Лид'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs text-muted-foreground">Этап</label>
                      <NativeSelect
                        className="mt-1 w-full"
                        value={selectedCard.stage_code}
                        onChange={(event) => void onChangeStage(selectedCard.id, event.target.value)}
                      >
                        {stages.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>Основные данные</CardTitle>
                      <UIButton
                        variant={editMode ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => setEditMode((prev) => !prev)}
                      >
                        {editMode ? 'Готово' : 'Редактировать'}
                      </UIButton>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {editMode ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Имя *</span>
                          <UIInput value={selectedCard.first_name ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, first_name: event.target.value } : prev))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Фамилия *</span>
                          <UIInput value={selectedCard.last_name ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, last_name: event.target.value } : prev))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Телефон</span>
                          <UIInput value={selectedCard.phone ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, phone: event.target.value } : prev))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Email</span>
                          <UIInput value={selectedCard.email ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, email: event.target.value } : prev))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Контакт</span>
                          <UIInput value={selectedCard.contact_link ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, contact_link: event.target.value } : prev))} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">Источник</span>
                          <UIInput value={selectedCard.lead_source ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, lead_source: event.target.value } : prev))} />
                        </div>
                        <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
                          <UIButton variant="default" onClick={() => void onSaveDetails()}>
                            Сохранить
                          </UIButton>
                          <UIButton
                            variant="outline"
                            onClick={() => {
                              void refreshSelectedCard(selectedCard.id);
                              setEditMode(false);
                            }}
                          >
                            Отменить
                          </UIButton>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Имя</span>
                          <span>{selectedCard.first_name || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Фамилия</span>
                          <span>{selectedCard.last_name || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Телефон</span>
                          <span>{selectedCard.phone || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Email</span>
                          <span>{selectedCard.email || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Контакт</span>
                          <span className="break-all">{selectedCard.contact_link || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Источник</span>
                          <span>{selectedCard.lead_source || '—'}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <CardTitle>Преподаватель</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <NativeSelect
                        className="w-full sm:min-w-[260px]"
                        value={selectedTeacherId ?? ''}
                        onChange={(event) => setSelectedTeacherId(event.target.value || null)}
                      >
                        <option value="">Не назначен</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacherNameById.get(teacher.id) ?? teacher.full_name}
                          </option>
                        ))}
                      </NativeSelect>
                      <UIButton
                        variant="default"
                        onClick={() => void onAssignTeacher()}
                        disabled={teacherSaving || !selectedCard || selectedCard.assigned_teacher_id === selectedTeacherId}
                      >
                        {teacherSaving ? (
                          <>
                            <Spinner className="size-4" />
                            <span>Сохранение...</span>
                          </>
                        ) : (
                          'Сохранить'
                        )}
                      </UIButton>
                    </div>
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <CardTitle>Занятия и оплата</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Осталось занятий</span>
                      <span className="text-base font-semibold">{selectedCard.paid_lessons_left}</span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                      <UIInput
                        type="number"
                        min={1}
                        value={manualLessonsToAdd}
                        className="h-9"
                        onChange={(event) => {
                          const value = event.target.value;
                          setManualLessonsToAdd(value === '' ? 1 : Number(value) || 1);
                        }}
                      />
                      <UIInput
                        value={manualLessonsComment}
                        onChange={(event) => setManualLessonsComment(event.target.value)}
                        placeholder="Комментарий к добавлению (обязательно)"
                      />
                      <UIButton onClick={() => void onAddManualLessons()} disabled={manualLessonsSaving}>
                        {manualLessonsSaving ? <Spinner className="size-4" /> : <PlusOutlined />}
                        Добавить
                      </UIButton>
                    </div>

                    <Separator className="my-4" />

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <NativeSelect
                        className="w-full flex-1"
                        value={selectedTariffId ?? ''}
                        disabled={Boolean(activePaymentLink)}
                        onChange={(event) => setSelectedTariffId(event.target.value)}
                      >
                        <option value="" disabled>
                          Выберите тариф
                        </option>
                        {tariffOptions.map((option) => (
                          <option key={String(option.value)} value={String(option.value)}>
                            {typeof option.label === 'string' ? option.label : String(option.value)}
                          </option>
                        ))}
                      </NativeSelect>
                      <UIButton
                        variant="default"
                        onClick={() => void onCreatePaymentLink()}
                        disabled={paymentLinkCreating || Boolean(activePaymentLink)}
                      >
                        {paymentLinkCreating ? (
                          <>
                            <Spinner className="size-4" />
                            <span>Создание...</span>
                          </>
                        ) : (
                          'Создать ссылку'
                        )}
                      </UIButton>
                    </div>

                    {activePaymentLink ? (
                      <div className="mt-3 min-w-0 flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                        <span className="text-sm text-muted-foreground">
                          Активная ссылка уже создана. Новую можно создать после окончания срока действия.
                        </span>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                          <UIInput value={activePaymentLink.payment_url} readOnly className="min-w-0 flex-1" />
                          <div className="flex flex-wrap gap-2">
                            <UIButton variant="outline" size="icon-sm" onClick={() => void onCopyPaymentLink(activePaymentLink.payment_url)}>
                              <CopyOutlined />
                            </UIButton>
                            <UIButton variant="outline" size="icon-sm" onClick={() => window.open(activePaymentLink.payment_url, '_blank', 'noopener,noreferrer')}>
                              <ExportOutlined />
                            </UIButton>
                            <UIButton variant="outline" disabled={paymentLinkCreating} onClick={() => void onRefreshPaymentLink()}>
                              {paymentLinkCreating ? <Spinner className="size-4" /> : <RedoOutlined />}
                              Обновить
                            </UIButton>
                            <UIButton variant="destructive" disabled={paymentLinkDeleting} onClick={() => void onDeleteActivePaymentLink()}>
                              {paymentLinkDeleting ? <Spinner className="size-4" /> : <DeleteOutlined />}
                              Удалить
                            </UIButton>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Срок действия: {formatCountdown(activePaymentLink.expires_at, nowTs)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                        Активной ссылки оплаты нет.
                      </div>
                    )}
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>История</CardTitle>
                      <UIButton
                        variant="link"
                        className="px-0 text-sm text-muted-foreground"
                        onClick={() => setShowFullHistory((prev) => !prev)}
                      >
                        {showFullHistory ? 'Скрыть полную историю' : 'Вся история'}
                      </UIButton>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {recentEvents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                        Событий пока нет.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {recentEvents.map((event) => (
                          <div key={event.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/70 p-2.5">
                            <UIAvatar className="size-8 ring-1 ring-border/50" style={{ backgroundColor: event.color }}>
                              <AvatarFallback />
                            </UIAvatar>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-sm">{event.title}</span>
                              {event.details ? <span className="text-xs text-muted-foreground">{event.details}</span> : null}
                              <span className="text-xs text-muted-foreground">{formatEventDate(event.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {showFullHistory ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {auditItems.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                            Лог пуст.
                          </div>
                        ) : (
                          auditItems.map((item) => {
                            const summary = getAuditSummary(item);
                            return (
                              <UICard key={item.id} size="sm" className="bg-background/80 ring-1 ring-border/40 shadow-sm">
                                <CardContent className="px-3 pb-3">
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-sm font-medium">{summary.title}</span>
                                    {summary.details ? <span className="text-sm text-muted-foreground">{summary.details}</span> : null}
                                    <span className="text-xs text-muted-foreground">
                                      {item.actor_login ?? 'admin'} • {formatDate(item.created_at)}
                                    </span>
                                  </div>
                                </CardContent>
                              </UICard>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle>Заметки</CardTitle>
                        <Badge variant="secondary">{cardComments.length}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-col gap-2">
                      <Textarea
                        rows={2}
                        value={newNoteBody}
                        onChange={(event) => setNewNoteBody(event.target.value)}
                        placeholder="Текст заметки"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Заметка сохраняется в общую историю карточки.</span>
                        <UIButton disabled={addingNote} onClick={() => void onAddNote()}>
                          {addingNote ? <Spinner className="size-4" /> : null}
                          Добавить заметку
                        </UIButton>
                      </div>
                    </div>

                    {cardComments.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                        Заметок пока нет.
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
                        {cardComments.map((comment) => (
                          <UICard key={comment.id} size="sm" className="bg-background/80 ring-1 ring-border/40 shadow-sm">
                            <CardContent className="px-3 pb-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-semibold">{`Заметка от ${comment.author_login ?? 'admin'}`}</span>
                                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
                                </div>
                                <span className="text-sm">{comment.body}</span>
                              </div>
                            </CardContent>
                          </UICard>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </UICard>

                <UICard size="sm" className="min-w-0 bg-card ring-1 ring-border/50 shadow-sm">
                  <CardHeader className="px-4 pb-2">
                    <CardTitle>Опасная зона</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <UIButton variant="destructive" onClick={() => void onArchiveSelectedCard()}>
                      В архив
                    </UIButton>
                  </CardContent>
                </UICard>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createModalOpen} onOpenChange={(open) => !open && setCreateModalOpen(false)}>
        <DialogContent className="w-[96vw] sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>Создать карточку</DialogTitle>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateCard();
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Имя *</label>
              <UIInput value={createForm.firstName} onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Фамилия *</label>
              <UIInput value={createForm.lastName} onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Телефон</label>
              <UIInput value={createForm.phone} onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Email</label>
              <UIInput value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1 md:col-span-1 lg:col-span-2">
              <label className="text-sm font-medium">Контакт</label>
              <UIInput value={createForm.contact} onChange={(event) => setCreateForm((prev) => ({ ...prev, contact: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1 md:col-span-1 lg:col-span-2">
              <label className="text-sm font-medium">Источник лида</label>
              <UIInput value={createForm.leadSource} onChange={(event) => setCreateForm((prev) => ({ ...prev, leadSource: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Дата начала занятий</label>
              <UIInput
                type="date"
                value={createForm.startLessonsAt}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, startLessonsAt: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-3">
              <label className="text-sm font-medium">Комментарий</label>
              <Textarea rows={1} value={createForm.comment} onChange={(event) => setCreateForm((prev) => ({ ...prev, comment: event.target.value }))} />
            </div>
            <div className="flex items-end gap-2 md:col-span-2 lg:col-span-4">
              <UIButton onClick={() => setCreateModalOpen(false)}>Отмена</UIButton>
              <UIButton type="submit" disabled={creating}>
                {creating ? <Spinner className="size-4" /> : null}
                Создать карточку
              </UIButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lossStageModal)} onOpenChange={(open) => !open && setLossStageModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выберите причину потери</DialogTitle>
          </DialogHeader>
          <NativeSelect
            className="w-full"
            value={lossReasonIdForMove ?? ''}
            onChange={(event) => setLossReasonIdForMove(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="" disabled>
              Причина потери
            </option>
            {lossReasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.name}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <UIButton onClick={() => setLossStageModal(null)}>Отмена</UIButton>
            <UIButton variant="default" onClick={confirmLossStageMove}>
              Подтвердить
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveModalOpen} onOpenChange={(open) => !open && setArchiveModalOpen(false)}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Архив карточек</DialogTitle>
          </DialogHeader>
          <div className="flex w-full flex-col gap-2">
            <NativeSelect
              value={restoreCardId ?? ''}
              disabled={archivedLoading}
              onChange={(event) => setRestoreCardId(event.target.value)}
            >
              <option value="" disabled>
                Выберите карточку
              </option>
              {archivedCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {`${formatPersonName({
                    firstName: card.first_name,
                    lastName: card.last_name,
                    fallbackFullName: card.full_name
                  })} (${card.stage_name})`}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              value={restoreStageCode ?? ''}
              disabled={archivedLoading}
              onChange={(event) => setRestoreStageCode(event.target.value)}
            >
              <option value="" disabled>
                Выберите этап восстановления
              </option>
              {stages.map((stage) => (
                <option key={stage.code} value={stage.code}>
                  {stage.name}
                </option>
              ))}
            </NativeSelect>

            <Separator className="my-3" />

            {archivedLoading ? (
              <ArchiveListSkeleton />
            ) : archivedCards.length === 0 ? (
              <span className="text-muted-foreground">Архив пуст</span>
            ) : (
              <div className="flex w-full flex-col gap-2">
                {archivedCards.map((item) => (
                  <UICard key={item.id} size="sm" className="bg-background/80 ring-1 ring-border/40 shadow-sm">
                    <CardContent className="px-3 pb-3">
                      <div className="flex flex-col gap-2">
                      <span>
                        {formatPersonName({
                          firstName: item.first_name,
                          lastName: item.last_name,
                          fallbackFullName: item.full_name
                        })}
                      </span>
                      <span className="text-muted-foreground">{item.stage_name}</span>
                      </div>
                    </CardContent>
                  </UICard>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <UIButton onClick={() => setArchiveModalOpen(false)}>Отмена</UIButton>
            <UIButton variant="default" disabled={archivedLoading} onClick={() => void onRestoreCard()}>
              Восстановить
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
