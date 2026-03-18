'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloseOutlined, CopyOutlined, DeleteOutlined, ExportOutlined, PlusOutlined, RedoOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message
} from 'antd';

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
  const [api, contextHolder] = message.useMessage();

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
      api.error('Не удалось загрузить архив');
      return;
    }

    const data = (await response.json()) as ArchivedCard[];
    setArchivedCards(data);
  }, [api]);

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
      api.success('Карточка создана');
      await loadBoard();
    } catch (createError) {
      api.error(createError instanceof Error ? createError.message : 'Ошибка создания карточки');
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
      api.error(payload?.message ?? 'Не удалось обновить этап');
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
      api.error('Имя и фамилия обязательны');
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
      api.error(payload?.message ?? 'Не удалось сохранить карточку');
      return;
    }

    api.success('Карточка сохранена');
    await loadBoard();
    await refreshSelectedCard(selectedCard.id);
  }

  async function onAddManualLessons() {
    if (!selectedCard) return;

    const lessonsToAdd = Math.trunc(manualLessonsToAdd);
    const trimmedComment = manualLessonsComment.trim();

    if (!Number.isInteger(lessonsToAdd) || lessonsToAdd < 1) {
      api.error('Укажите положительное целое количество занятий');
      return;
    }

    if (!trimmedComment) {
      api.error('Комментарий обязателен');
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
      api.error(payload?.message ?? 'Не удалось добавить занятия');
      return;
    }

    api.success(`Добавлено ${lessonsToAdd} занятий`);
    setManualLessonsToAdd(1);
    setManualLessonsComment('');
    await loadBoard();
    await refreshSelectedCard(selectedCard.id);
  }

  async function onAddNote() {
    if (!selectedCard) return;
    const body = newNoteBody.trim();

    if (!body) {
      api.error('Введите текст заметки');
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
      api.error(payload?.message ?? 'Не удалось добавить заметку');
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
      api.error(payload?.message ?? 'Не удалось сохранить преподавателя');
      return;
    }

    api.success(selectedTeacherId ? 'Преподаватель назначен' : 'Преподаватель снят');
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
        api.error(payload.message ?? 'У ученика уже есть активная ссылка');
        await refreshSelectedCard(selectedCard.id);
        return;
      }
      api.error(payload?.message ?? 'Не удалось создать ссылку оплаты');
      return;
    }

    const payload = (await response.json()) as { confirmationUrl: string };
    api.success('Ссылка на оплату создана');

    if (payload.confirmationUrl) {
      window.open(payload.confirmationUrl, '_blank', 'noopener,noreferrer');
    }

    await refreshSelectedCard(selectedCard.id);
  }

  async function onCopyPaymentLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      api.success('Ссылка скопирована');
    } catch {
      api.error('Не удалось скопировать ссылку');
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
      api.error(payload?.message ?? 'Не удалось обновить ссылку оплаты');
      return;
    }

    const payload = (await response.json()) as { confirmationUrl?: string };
    api.success('Ссылка оплаты обновлена');

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
      api.error(payload?.message ?? 'Не удалось удалить активную ссылку');
      return;
    }

    api.success('Активная ссылка удалена');
    await refreshSelectedCard(selectedCard.id);
  }

  async function onArchiveSelectedCard() {
    if (!selectedCard) return;

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/archive`, { method: 'POST' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      api.error(payload?.message ?? 'Не удалось архивировать карточку');
      return;
    }

    api.success('Карточка архивирована');
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
      api.error('Выберите карточку и этап восстановления');
      return;
    }

    const response = await fetch(`/api/v1/funnel/cards/${restoreCardId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode: restoreStageCode })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      api.error(payload?.message ?? 'Не удалось восстановить карточку');
      return;
    }

    api.success('Карточка восстановлена');
    setArchiveModalOpen(false);
    await loadBoard();
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}

      <div>
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          Воронка
        </Typography.Title>
        <Typography.Text type="secondary">
          Управление лидами/учениками по этапам с учётом оплат, истории изменений и архива.
        </Typography.Text>
      </div>

      <Card>
        <Space>
          <Button type="primary" onClick={() => setCreateModalOpen(true)}>
            Создать карточку
          </Button>
          <Button onClick={() => void loadBoard()}>Обновить</Button>
          <Button onClick={() => void onOpenArchive()}>Архив карточек</Button>
        </Space>
      </Card>

      {error ? <Alert type="error" title={error} showIcon /> : null}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row ref={boardScrollContainerRef} gutter={[12, 12]} wrap={false} style={{ overflowX: 'auto', paddingBottom: 4 }}>
          {stages.map((stage) => {
            const stageCards = groupedCards.get(stage.code) ?? [];
            const isActiveDropZone = draggedCardId !== null && dragOverStageCode === stage.code;

            return (
              <Col key={stage.id} style={{ minWidth: 320 }}>
                <Card
                  title={stage.name}
                  extra={<Typography.Text type="secondary">{stageCards.length}</Typography.Text>}
                  style={{
                    borderColor: isActiveDropZone ? '#1677ff' : undefined,
                    boxShadow: isActiveDropZone ? '0 0 0 2px rgba(22,119,255,0.15)' : undefined
                  }}
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
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    {stageCards.map((card) => (
                      <Card
                        key={card.id}
                        size="small"
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
                        hoverable
                      >
                        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                          <Typography.Text strong>
                            {formatPersonName({
                              firstName: card.first_name,
                              lastName: card.last_name,
                              fallbackFullName: card.full_name
                            })}
                          </Typography.Text>
                          <Typography.Text type="secondary">
                            Преподаватель:{' '}
                            {card.assigned_teacher_id
                              ? teacherNameById.get(card.assigned_teacher_id) ?? card.teacher_full_name ?? 'Не назначен'
                              : 'Не назначен'}
                          </Typography.Text>
                          <Typography.Text type="secondary">Следующее занятие: {formatDate(card.next_lesson_at)}</Typography.Text>
                          <Typography.Text type="secondary">Осталось занятий: {card.paid_lessons_left}</Typography.Text>
                          <Tag color={card.entity_type === 'student' ? 'green' : 'blue'}>{card.entity_type === 'student' ? 'Ученик' : 'Лид'}</Tag>
                          <Select
                            size="small"
                            value={card.stage_code}
                            options={stages.map((item) => ({ value: item.code, label: item.name }))}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(value) => void onChangeStage(card.id, value)}
                          />
                        </Space>
                      </Card>
                    ))}

                    {stageCards.length === 0 ? (
                      <div
                        style={{
                          minHeight: 120,
                          border: isActiveDropZone ? '2px dashed #1677ff' : '1px dashed #d9d9d9',
                          borderRadius: 8,
                          background: isActiveDropZone ? 'rgba(22,119,255,0.08)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          padding: 12
                        }}
                      >
                        <Typography.Text type={isActiveDropZone ? undefined : 'secondary'}>
                          {draggedCardId ? 'Отпустите карточку, чтобы переместить сюда' : 'Нет карточек'}
                        </Typography.Text>
                      </div>
                    ) : null}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Drawer
        title={null}
        closeIcon={null}
        open={drawerOpen}
        size={595}
        styles={{ body: { padding: '28px 24px 20px' } }}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCard(null);
          setManualLessonsToAdd(1);
          setManualLessonsComment('');
          setShowFullHistory(false);
          setEditMode(false);
          setNewNoteBody('');
        }}
      >
        {detailsLoading || !selectedCard ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <Space orientation="vertical" size={24} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space size={14}>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setDrawerOpen(false);
                    setSelectedCard(null);
                  }}
                />
                <Typography.Text style={{ fontSize: 20 }}>Карточка ученика</Typography.Text>
              </Space>
              <Button
                type={editMode ? 'default' : 'primary'}
                size="small"
                style={!editMode ? { borderRadius: 20, background: '#000', borderColor: '#000' } : { borderRadius: 20 }}
                onClick={() => setEditMode((prev) => !prev)}
              >
                {editMode ? 'Готово' : 'Редактировать'}
              </Button>
            </Space>

            <Space size={12} align="start">
              <Avatar size={64}>{selectedCard.first_name?.[0] ?? 'У'}</Avatar>
              <Space orientation="vertical" size={2}>
                <Typography.Text strong style={{ fontSize: 20, lineHeight: 1.1 }}>
                  {formatPersonName({
                    firstName: selectedCard.first_name,
                    lastName: selectedCard.last_name,
                    fallbackFullName: selectedCard.full_name
                  })}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 20, color: 'rgba(0,0,0,0.64)', textDecoration: 'underline' }}>
                  {selectedCard.contact_link || '@telegram'}
                </Typography.Text>
              </Space>
            </Space>

            {editMode ? (
              <Card size="small" title="Редактирование данных">
                <Row gutter={12}>
                  <Col span={12}>
                    <Typography.Text>Имя</Typography.Text>
                    <Input value={selectedCard.first_name} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, first_name: event.target.value } : prev))} />
                  </Col>
                  <Col span={12}>
                    <Typography.Text>Фамилия</Typography.Text>
                    <Input value={selectedCard.last_name} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, last_name: event.target.value } : prev))} />
                  </Col>
                  <Col span={12}>
                    <Typography.Text>Телефон</Typography.Text>
                    <Input value={selectedCard.phone} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, phone: event.target.value } : prev))} />
                  </Col>
                  <Col span={12}>
                    <Typography.Text>Email</Typography.Text>
                    <Input value={selectedCard.email} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, email: event.target.value } : prev))} />
                  </Col>
                  <Col span={12}>
                    <Typography.Text>Контакт</Typography.Text>
                    <Input value={selectedCard.contact_link} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, contact_link: event.target.value } : prev))} />
                  </Col>
                  <Col span={12}>
                    <Typography.Text>Источник</Typography.Text>
                    <Input value={selectedCard.lead_source} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, lead_source: event.target.value } : prev))} />
                  </Col>
                  <Col span={24}>
                    <Space>
                      <Button type="primary" onClick={() => void onSaveDetails()}>
                        Сохранить
                      </Button>
                      <Button danger onClick={() => void onArchiveSelectedCard()}>
                        В архив
                      </Button>
                    </Space>
                  </Col>
                </Row>
              </Card>
            ) : null}

            <Card size="small" title="Преподаватель">
              <Space>
                <Select
                  style={{ minWidth: 260 }}
                  placeholder="Не назначен"
                  value={selectedTeacherId}
                  onChange={(value) => setSelectedTeacherId(value ?? null)}
                  options={teachers.map((teacher) => ({ value: teacher.id, label: teacherNameById.get(teacher.id) ?? teacher.full_name }))}
                  allowClear
                />
                <Button
                  type="primary"
                  loading={teacherSaving}
                  onClick={() => void onAssignTeacher()}
                  disabled={!selectedCard || selectedCard.assigned_teacher_id === selectedTeacherId}
                >
                  Сохранить
                </Button>
              </Space>
            </Card>

            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Typography.Text strong style={{ fontSize: 20 }}>
                    Занятия
                  </Typography.Text>
                  <Button
                    onClick={() => void onAddManualLessons()}
                    loading={manualLessonsSaving}
                    size="small"
                    style={{ borderRadius: 20, background: '#000', color: '#fff', borderColor: '#000' }}
                  >
                    <PlusOutlined /> Добавить
                  </Button>
                </Space>
                <Typography.Text style={{ fontSize: 20, color: 'rgba(0,0,0,0.64)' }}>{`Осталось ${selectedCard.paid_lessons_left}`}</Typography.Text>
              </Space>

              <Space style={{ width: '100%' }}>
                <InputNumber
                  min={1}
                  precision={0}
                  value={manualLessonsToAdd}
                  onChange={(value) => setManualLessonsToAdd(Number(value) || 1)}
                />
                <Input
                  value={manualLessonsComment}
                  onChange={(event) => setManualLessonsComment(event.target.value)}
                  placeholder="Комментарий к добавлению (обязательно)"
                />
              </Space>

              <div style={{ width: '100%', position: 'relative', height: 12, borderRadius: 11, background: '#ddf8e9' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: 12,
                    borderRadius: 11,
                    background: '#22c55e',
                    width: `${Math.max(12, Math.min(100, selectedCard.paid_lessons_left * 15))}%`
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: -3,
                    left: `calc(${Math.max(12, Math.min(100, selectedCard.paid_lessons_left * 15))}% - 10px)`,
                    width: 20,
                    height: 18,
                    borderRadius: 11,
                    background: '#000'
                  }}
                />
              </div>

              <Space style={{ width: '100%' }}>
                <Select
                  style={{ minWidth: 360, flex: 1 }}
                  placeholder="Выберите тариф и пакет"
                  value={selectedTariffPackageId}
                  onChange={(value) => setSelectedTariffPackageId(value)}
                  options={tariffPackageOptions}
                  disabled={Boolean(activePaymentLink)}
                />
                <Button
                  type="primary"
                  loading={paymentLinkCreating}
                  onClick={() => void onCreatePaymentLink()}
                  style={{ borderRadius: 20 }}
                  disabled={Boolean(activePaymentLink)}
                >
                  Создать ссылку
                </Button>
              </Space>

              {activePaymentLink ? (
                <Space orientation="vertical" style={{ width: '100%' }} size={6}>
                  <Typography.Text type="secondary">
                    Активная ссылка уже создана. Новую можно создать после окончания срока действия.
                  </Typography.Text>
                  <Space style={{ width: '100%' }}>
                    <Input value={activePaymentLink.payment_url} readOnly />
                    <Button icon={<CopyOutlined />} onClick={() => void onCopyPaymentLink(activePaymentLink.payment_url)} />
                    <Button icon={<ExportOutlined />} onClick={() => window.open(activePaymentLink.payment_url, '_blank', 'noopener,noreferrer')} />
                    <Button loading={paymentLinkCreating} icon={<RedoOutlined />} onClick={() => void onRefreshPaymentLink()}>
                      Обновить
                    </Button>
                    <Button danger loading={paymentLinkDeleting} icon={<DeleteOutlined />} onClick={() => void onDeleteActivePaymentLink()}>
                      Удалить
                    </Button>
                  </Space>
                  <Typography.Text type="secondary">
                    Срок действия: {formatCountdown(activePaymentLink.expires_at, nowTs)}
                  </Typography.Text>
                </Space>
              ) : null}
            </Space>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Text strong style={{ fontSize: 20 }}>
                Последние события
              </Typography.Text>
              <Button
                type="link"
                style={{ color: 'rgba(0,0,0,0.64)', textDecoration: 'underline', fontSize: 20, paddingInline: 0 }}
                onClick={() => setShowFullHistory((prev) => !prev)}
              >
                Вся история
              </Button>
            </Space>

            {recentEvents.length === 0 ? (
              <Typography.Text type="secondary">Событий пока нет</Typography.Text>
            ) : (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                {recentEvents.map((event) => (
                  <Space key={event.id} align="start">
                    <Avatar size={40} style={{ backgroundColor: event.color }} />
                    <Space orientation="vertical" size={0}>
                      <Typography.Text style={{ fontSize: 16 }}>{event.title}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatEventDate(event.created_at)}
                      </Typography.Text>
                    </Space>
                  </Space>
                ))}
              </Space>
            )}

            {showFullHistory ? (
              <Card size="small" title="Полная история">
                {auditItems.length === 0 ? (
                  <Typography.Text type="secondary">Лог пуст</Typography.Text>
                ) : (
                  <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                    {auditItems.map((item) => (
                      <Card key={item.id} size="small">
                        <Space orientation="vertical" size={0}>
                          <Typography.Text>
                            {auditActionLabel(item.action)} • {item.actor_login ?? 'admin'}
                          </Typography.Text>
                          {item.action === 'manual_lessons_add' ? (
                            <Typography.Text>
                              {`+${Number(item.diff_after?.lessons_added ?? 0)} занятий`}
                              {typeof item.diff_after?.comment === 'string' ? ` • ${item.diff_after.comment}` : ''}
                            </Typography.Text>
                          ) : null}
                          <Typography.Text type="secondary">{formatDate(item.created_at)}</Typography.Text>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Card>
            ) : null}

            <Card size="small">
              <Space style={{ width: '100%', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                <Space>
                  <Typography.Text strong style={{ fontSize: 20 }}>
                    Заметки
                  </Typography.Text>
                  <Tag color="default">{cardComments.length}</Tag>
                </Space>
                <Button type="link" danger onClick={() => void onAddNote()} style={{ paddingInline: 0 }}>
                  Добавить
                </Button>
              </Space>
              <div style={{ height: 8 }} />
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  rows={2}
                  value={newNoteBody}
                  onChange={(event) => setNewNoteBody(event.target.value)}
                  placeholder="Текст заметки"
                />
                <Button loading={addingNote} onClick={() => void onAddNote()}>
                  Добавить заметку
                </Button>

                {cardComments.length === 0 ? (
                  <Typography.Text type="secondary">Заметок пока нет</Typography.Text>
                ) : (
                  <Card size="small">
                    <Space orientation="vertical" size={6}>
                      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Typography.Text strong>{`Заметка от ${cardComments[0].author_login ?? 'admin'}`}</Typography.Text>
                        <Typography.Text type="secondary">{formatDate(cardComments[0].created_at)}</Typography.Text>
                      </Space>
                      <Typography.Text>{cardComments[0].body}</Typography.Text>
                    </Space>
                  </Card>
                )}
              </Space>
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        title="Создать карточку"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={960}
      >
        <Form layout="vertical" onFinish={() => void onCreateCard()}>
          <Row gutter={12}>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Имя" required>
                <Input value={createForm.firstName} onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Фамилия" required>
                <Input value={createForm.lastName} onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Телефон">
                <Input value={createForm.phone} onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Email">
                <Input value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Контакт">
                <Input value={createForm.contact} onChange={(event) => setCreateForm((prev) => ({ ...prev, contact: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Источник лида">
                <Input value={createForm.leadSource} onChange={(event) => setCreateForm((prev) => ({ ...prev, leadSource: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Дата начала занятий">
                <Input
                  type="date"
                  value={createForm.startLessonsAt}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, startLessonsAt: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Комментарий">
                <Input.TextArea rows={1} value={createForm.comment} onChange={(event) => setCreateForm((prev) => ({ ...prev, comment: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={24}>
              <Space>
                <Button onClick={() => setCreateModalOpen(false)}>Отмена</Button>
                <Button type="primary" htmlType="submit" loading={creating}>
                  Создать карточку
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Выберите причину потери"
        open={Boolean(lossStageModal)}
        onCancel={() => setLossStageModal(null)}
        onOk={() => {
          if (!lossStageModal || !lossReasonIdForMove) {
            api.error('Выберите причину');
            return;
          }

          void moveStage(lossStageModal.cardId, lossStageModal.stageCode, lossReasonIdForMove);
          setLossStageModal(null);
          setLossReasonIdForMove(null);
        }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="Причина потери"
          value={lossReasonIdForMove}
          onChange={(value) => setLossReasonIdForMove(value)}
          options={lossReasons.map((reason) => ({ value: reason.id, label: reason.name }))}
        />
      </Modal>

      <Modal
        title="Архив карточек"
        open={archiveModalOpen}
        onCancel={() => setArchiveModalOpen(false)}
        onOk={() => void onRestoreCard()}
        okText="Восстановить"
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="Выберите карточку"
            value={restoreCardId}
            onChange={(value) => setRestoreCardId(value)}
            options={archivedCards.map((card) => ({
              value: card.id,
              label: `${formatPersonName({
                firstName: card.first_name,
                lastName: card.last_name,
                fallbackFullName: card.full_name
              })} (${card.stage_name})`
            }))}
          />

          <Select
            placeholder="Выберите этап восстановления"
            value={restoreStageCode}
            onChange={(value) => setRestoreStageCode(value)}
            options={stages.map((stage) => ({ value: stage.code, label: stage.name }))}
          />

          <Divider />

          {archivedCards.length === 0 ? (
            <Typography.Text type="secondary">Архив пуст</Typography.Text>
          ) : (
            <Space orientation="vertical" style={{ width: '100%' }} size={8}>
              {archivedCards.map((item) => (
                <Card key={item.id} size="small">
                  <Space orientation="vertical" size={0}>
                    <Typography.Text>
                      {formatPersonName({
                        firstName: item.first_name,
                        lastName: item.last_name,
                        fallbackFullName: item.full_name
                      })}
                    </Typography.Text>
                    <Typography.Text type="secondary">{item.stage_name}</Typography.Text>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
