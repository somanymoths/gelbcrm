'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, Plus, RefreshCw, Trash2, X } from 'lucide-react';
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@/components/ui';

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

function auditActionLabel(action: string): string {
  if (action === 'manual_lessons_add') return 'Ручное добавление занятий';
  if (action === 'add_comment') return 'Комментарий';
  if (action === 'assign_teacher') return 'Назначение преподавателя';
  if (action === 'move_stage') return 'Смена этапа';
  if (action === 'archive') return 'Архивация';
  if (action === 'restore') return 'Восстановление';
  if (action === 'create') return 'Создание карточки';
  if (action === 'update') return 'Обновление карточки';
  return action;
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

  const diff = targetTs - nowTs;
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

  const [selectedTariffPackageId, setSelectedTariffPackageId] = useState<string | null>(null);
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
    const response = await fetch('/api/v1/funnel/archived', { cache: 'no-store' });
    if (!response.ok) {
      toast.error('Не удалось загрузить архив');
      return;
    }

    const data = (await response.json()) as ArchivedCard[];
    setArchivedCards(data);
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

  const tariffPackageOptions = useMemo(() => {
    return tariffs.flatMap((tariff) =>
      tariff.packages.map((pkg) => ({
        value: pkg.id,
        label: `${tariff.name}: ${pkg.lessons_count} занятий / ${pkg.total_price_rub} ₽`
      }))
    );
  }, [tariffs]);

  const recentEvents = useMemo(() => {
    const events: Array<{ id: string; title: string; created_at: string; color: string }> = [];

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
      let title = auditActionLabel(item.action);

      if (item.action === 'manual_lessons_add') {
        title = `+${Number(item.diff_after?.lessons_added ?? 0)} новых занятий`;
      } else if (item.action === 'move_stage' && item.diff_after?.stage_code === 'last_lesson') {
        title = 'Закончил занятие';
      }

      events.push({
        id: `audit-${item.id}`,
        title,
        created_at: item.created_at,
        color: item.action === 'manual_lessons_add' ? '#d9d9f3' : '#e6e7f5'
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
    if (!selectedCard || !selectedTariffPackageId) return;

    setPaymentLinkCreating(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/payment-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tariffPackageId: selectedTariffPackageId })
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

  function closeDetailsDrawer() {
    setDrawerOpen(false);
    setSelectedCard(null);
    setManualLessonsToAdd(1);
    setManualLessonsComment('');
    setShowFullHistory(false);
    setEditMode(false);
    setNewNoteBody('');
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Воронка</h2>
        <p className="text-sm text-muted-foreground">Управление лидами/учениками по этапам с учётом оплат, истории изменений и архива.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <Button onClick={() => setCreateModalOpen(true)}>Создать карточку</Button>
          <Button variant="outline" onClick={() => void loadBoard()}>
            Обновить
          </Button>
          <Button variant="outline" onClick={() => void onOpenArchive()}>
            Архив карточек
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : (
        <div ref={boardScrollContainerRef} className="flex gap-3 overflow-x-auto pb-1">
          {stages.map((stage) => {
            const stageCards = groupedCards.get(stage.code) ?? [];
            const isActiveDropZone = draggedCardId !== null && dragOverStageCode === stage.code;

            return (
              <Card
                key={stage.id}
                className={`min-w-[320px] ${isActiveDropZone ? 'border-primary shadow-[0_0_0_2px_rgba(59,130,246,0.15)]' : ''}`}
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
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{stage.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{stageCards.length}</span>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {stageCards.map((card) => (
                    <Card
                      key={card.id}
                      className="cursor-grab border-border/70 p-3 transition hover:border-border"
                      draggable
                      style={{ opacity: draggedCardId === card.id ? 0.5 : 1 }}
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
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-semibold">
                          {formatPersonName({
                            firstName: card.first_name,
                            lastName: card.last_name,
                            fallbackFullName: card.full_name
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Преподаватель:{' '}
                          {card.assigned_teacher_id ? teacherNameById.get(card.assigned_teacher_id) ?? card.teacher_full_name ?? 'Не назначен' : 'Не назначен'}
                        </p>
                        <p className="text-xs text-muted-foreground">Следующее занятие: {formatDate(card.next_lesson_at)}</p>
                        <p className="text-xs text-muted-foreground">Осталось занятий: {card.paid_lessons_left}</p>
                        <Badge variant={card.entity_type === 'student' ? 'secondary' : 'outline'} className="w-fit">
                          {card.entity_type === 'student' ? 'Ученик' : 'Лид'}
                        </Badge>
                        <div onClick={(event) => event.stopPropagation()}>
                          <Select value={card.stage_code} onValueChange={(value) => void onChangeStage(card.id, value)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stages.map((item) => (
                                <SelectItem key={item.code} value={item.code}>
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {stageCards.length === 0 ? (
                    <div
                      className={`flex min-h-[120px] items-center justify-center rounded-md border border-dashed px-3 text-center text-sm ${
                        isActiveDropZone ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {draggedCardId ? 'Отпустите карточку, чтобы переместить сюда' : 'Нет карточек'}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={drawerOpen} onOpenChange={(open) => (!open ? closeDetailsDrawer() : undefined)}>
        <DialogContent className="!left-auto !right-0 !top-0 !h-screen !max-w-[595px] !translate-x-0 !translate-y-0 overflow-y-auto rounded-none p-6">
          {detailsLoading || !selectedCard ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : (
            <div className="flex w-full flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={closeDetailsDrawer}>
                    <X className="h-4 w-4" />
                  </Button>
                  <p className="text-lg font-medium">Карточка ученика</p>
                </div>
                <Button variant={editMode ? 'outline' : 'default'} size="sm" className="rounded-full" onClick={() => setEditMode((prev) => !prev)}>
                  {editMode ? 'Готово' : 'Редактировать'}
                </Button>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-semibold">
                  {selectedCard.first_name?.[0] ?? 'У'}
                </div>
                <div className="flex flex-col">
                  <p className="text-xl font-semibold leading-tight">
                    {formatPersonName({
                      firstName: selectedCard.first_name,
                      lastName: selectedCard.last_name,
                      fallbackFullName: selectedCard.full_name
                    })}
                  </p>
                  <p className="text-lg text-muted-foreground underline">{selectedCard.contact_link || '@telegram'}</p>
                </div>
              </div>

              {editMode ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Редактирование данных</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-sm">Имя</p>
                      <Input value={selectedCard.first_name} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, first_name: event.target.value } : prev))} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm">Фамилия</p>
                      <Input value={selectedCard.last_name} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, last_name: event.target.value } : prev))} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm">Телефон</p>
                      <Input value={selectedCard.phone} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, phone: event.target.value } : prev))} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm">Email</p>
                      <Input value={selectedCard.email} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, email: event.target.value } : prev))} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm">Контакт</p>
                      <Input value={selectedCard.contact_link} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, contact_link: event.target.value } : prev))} />
                    </div>
                    <div>
                      <p className="mb-1 text-sm">Источник</p>
                      <Input value={selectedCard.lead_source} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, lead_source: event.target.value } : prev))} />
                    </div>
                    <div className="col-span-2 flex gap-2 pt-1">
                      <Button onClick={() => void onSaveDetails()}>Сохранить</Button>
                      <Button variant="destructive" onClick={() => void onArchiveSelectedCard()}>
                        В архив
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Преподаватель</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Select
                    value={selectedTeacherId ?? '__none__'}
                    onValueChange={(value) => setSelectedTeacherId(value === '__none__' ? null : value)}
                  >
                    <SelectTrigger className="min-w-[260px] flex-1">
                      <SelectValue placeholder="Не назначен" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не назначен</SelectItem>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacherNameById.get(teacher.id) ?? teacher.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void onAssignTeacher()} disabled={!selectedCard || selectedCard.assigned_teacher_id === selectedTeacherId}>
                    {teacherSaving ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-semibold">Занятия</p>
                    <Button variant="outline" size="sm" onClick={() => void onAddManualLessons()} disabled={manualLessonsSaving}>
                      <Plus className="mr-1 h-4 w-4" />
                      {manualLessonsSaving ? 'Сохранение...' : 'Добавить'}
                    </Button>
                  </div>
                  <p className="text-lg text-muted-foreground">{`Осталось ${selectedCard.paid_lessons_left}`}</p>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={manualLessonsToAdd}
                    onChange={(event) => setManualLessonsToAdd(Math.max(1, Number(event.target.value) || 1))}
                    className="max-w-[120px]"
                  />
                  <Input value={manualLessonsComment} onChange={(event) => setManualLessonsComment(event.target.value)} placeholder="Комментарий к добавлению (обязательно)" />
                </div>

                <div className="relative h-3 w-full rounded-full bg-emerald-100">
                  <div
                    className="absolute left-0 top-0 h-3 rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(12, Math.min(100, selectedCard.paid_lessons_left * 15))}%` }}
                  />
                  <div
                    className="absolute top-[-3px] h-[18px] w-5 rounded-full bg-black"
                    style={{ left: `calc(${Math.max(12, Math.min(100, selectedCard.paid_lessons_left * 15))}% - 10px)` }}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Select
                    value={selectedTariffPackageId ?? undefined}
                    onValueChange={setSelectedTariffPackageId}
                    disabled={Boolean(activePaymentLink)}
                  >
                    <SelectTrigger className="min-w-[360px] flex-1">
                      <SelectValue placeholder="Выберите тариф и пакет" />
                    </SelectTrigger>
                    <SelectContent>
                      {tariffPackageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void onCreatePaymentLink()} disabled={Boolean(activePaymentLink) || paymentLinkCreating}>
                    {paymentLinkCreating ? 'Создание...' : 'Создать ссылку'}
                  </Button>
                </div>

                {activePaymentLink ? (
                  <div className="flex w-full flex-col gap-2">
                    <p className="text-sm text-muted-foreground">Активная ссылка уже создана. Новую можно создать после окончания срока действия.</p>
                    <div className="flex flex-wrap gap-2">
                      <Input value={activePaymentLink.payment_url} readOnly />
                      <Button variant="outline" size="icon" onClick={() => void onCopyPaymentLink(activePaymentLink.payment_url)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(activePaymentLink.payment_url, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={() => void onRefreshPaymentLink()} disabled={paymentLinkCreating}>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        {paymentLinkCreating ? '...' : 'Обновить'}
                      </Button>
                      <Button variant="destructive" onClick={() => void onDeleteActivePaymentLink()} disabled={paymentLinkDeleting}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        {paymentLinkDeleting ? '...' : 'Удалить'}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Срок действия: {formatCountdown(activePaymentLink.expires_at, nowTs)}</p>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xl font-semibold">Последние события</p>
                <Button variant="link" className="px-0 text-base text-muted-foreground underline" onClick={() => setShowFullHistory((prev) => !prev)}>
                  Вся история
                </Button>
              </div>

              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Событий пока нет</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full" style={{ backgroundColor: event.color }} />
                      <div className="flex flex-col">
                        <p className="text-base">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{formatEventDate(event.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showFullHistory ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Полная история</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {auditItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Лог пуст</p>
                    ) : (
                      <div className="flex w-full flex-col gap-2">
                        {auditItems.map((item) => (
                          <Card key={item.id} className="p-3">
                            <div className="flex flex-col gap-0.5">
                              <p className="text-sm">
                                {auditActionLabel(item.action)} • {item.actor_login ?? 'admin'}
                              </p>
                              {item.action === 'manual_lessons_add' ? (
                                <p className="text-sm">
                                  {`+${Number(item.diff_after?.lessons_added ?? 0)} занятий`}
                                  {typeof item.diff_after?.comment === 'string' ? ` • ${item.diff_after.comment}` : ''}
                                </p>
                              ) : null}
                              <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader className="flex-row items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">Заметки</CardTitle>
                    <Badge variant="outline">{cardComments.length}</Badge>
                  </div>
                  <Button variant="link" className="px-0 text-destructive" onClick={() => void onAddNote()}>
                    Добавить
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-3">
                  <Textarea rows={2} value={newNoteBody} onChange={(event) => setNewNoteBody(event.target.value)} placeholder="Текст заметки" />
                  <Button onClick={() => void onAddNote()} disabled={addingNote}>
                    {addingNote ? 'Сохранение...' : 'Добавить заметку'}
                  </Button>

                  {cardComments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Заметок пока нет</p>
                  ) : (
                    <Card className="p-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{`Заметка от ${cardComments[0].author_login ?? 'admin'}`}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(cardComments[0].created_at)}</p>
                        </div>
                        <p className="text-sm">{cardComments[0].body}</p>
                      </div>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Создать карточку</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateCard();
            }}
            className="grid grid-cols-12 gap-3"
          >
            <div className="col-span-12 md:col-span-6 lg:col-span-3">
              <p className="mb-1 text-sm">Имя</p>
              <Input value={createForm.firstName} onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-3">
              <p className="mb-1 text-sm">Фамилия</p>
              <Input value={createForm.lastName} onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-3">
              <p className="mb-1 text-sm">Телефон</p>
              <Input value={createForm.phone} onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-3">
              <p className="mb-1 text-sm">Email</p>
              <Input value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-4">
              <p className="mb-1 text-sm">Контакт</p>
              <Input value={createForm.contact} onChange={(event) => setCreateForm((prev) => ({ ...prev, contact: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-4">
              <p className="mb-1 text-sm">Источник лида</p>
              <Input value={createForm.leadSource} onChange={(event) => setCreateForm((prev) => ({ ...prev, leadSource: event.target.value }))} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-3">
              <p className="mb-1 text-sm">Дата начала занятий</p>
              <Input type="date" value={createForm.startLessonsAt} onChange={(event) => setCreateForm((prev) => ({ ...prev, startLessonsAt: event.target.value }))} />
            </div>
            <div className="col-span-12 lg:col-span-6">
              <p className="mb-1 text-sm">Комментарий</p>
              <Textarea rows={2} value={createForm.comment} onChange={(event) => setCreateForm((prev) => ({ ...prev, comment: event.target.value }))} />
            </div>
            <div className="col-span-12 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Создание...' : 'Создать карточку'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lossStageModal)} onOpenChange={(open) => (!open ? setLossStageModal(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выберите причину потери</DialogTitle>
          </DialogHeader>
          <Select value={lossReasonIdForMove ? String(lossReasonIdForMove) : undefined} onValueChange={(value) => setLossReasonIdForMove(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Причина потери" />
            </SelectTrigger>
            <SelectContent>
              {lossReasons.map((reason) => (
                <SelectItem key={reason.id} value={String(reason.id)}>
                  {reason.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossStageModal(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (!lossStageModal || !lossReasonIdForMove) {
                  toast.error('Выберите причину');
                  return;
                }
                void moveStage(lossStageModal.cardId, lossStageModal.stageCode, lossReasonIdForMove);
                setLossStageModal(null);
                setLossReasonIdForMove(null);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveModalOpen} onOpenChange={setArchiveModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Архив карточек</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Select value={restoreCardId ?? undefined} onValueChange={setRestoreCardId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите карточку" />
              </SelectTrigger>
              <SelectContent>
                {archivedCards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {`${formatPersonName({
                      firstName: card.first_name,
                      lastName: card.last_name,
                      fallbackFullName: card.full_name
                    })} (${card.stage_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={restoreStageCode ?? undefined} onValueChange={setRestoreStageCode}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите этап восстановления" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.code} value={stage.code}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="h-px bg-border" />

            {archivedCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Архив пуст</p>
            ) : (
              <div className="flex flex-col gap-2">
                {archivedCards.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm">
                        {formatPersonName({
                          firstName: item.first_name,
                          lastName: item.last_name,
                          fallbackFullName: item.full_name
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.stage_name}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => void onRestoreCard()}>Восстановить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
