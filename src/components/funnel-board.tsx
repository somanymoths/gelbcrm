'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
};

type ArchivedCard = FunnelCard;

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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusLabel(status: PaymentLink['status']): string {
  if (status === 'pending') return 'Ожидает оплату';
  if (status === 'paid') return 'Оплачено';
  if (status === 'failed') return 'Ошибка/отклонено';
  return 'Истекла';
}

function statusColor(status: PaymentLink['status']): string {
  if (status === 'pending') return 'gold';
  if (status === 'paid') return 'green';
  if (status === 'failed') return 'red';
  return 'default';
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

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [teacherSaving, setTeacherSaving] = useState(false);

  const [selectedTariffPackageId, setSelectedTariffPackageId] = useState<string | null>(null);
  const [paymentLinkCreating, setPaymentLinkCreating] = useState(false);

  const [archivedCards, setArchivedCards] = useState<ArchivedCard[]>([]);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [restoreStageCode, setRestoreStageCode] = useState<string | null>(null);
  const [restoreCardId, setRestoreCardId] = useState<string | null>(null);

  const [lossStageModal, setLossStageModal] = useState<{ cardId: string; stageCode: string } | null>(null);
  const [lossReasonIdForMove, setLossReasonIdForMove] = useState<number | null>(null);

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [boardRes, lossReasonsRes, teachersRes, tariffsRes] = await Promise.all([
        fetch('/api/v1/funnel/board', { cache: 'no-store' }),
        fetch('/api/v1/funnel/loss-reasons', { cache: 'no-store' }),
        fetch('/api/v1/funnel/teachers', { cache: 'no-store' }),
        fetch('/api/v1/funnel/payment-tariffs', { cache: 'no-store' })
      ]);

      if (!boardRes.ok || !lossReasonsRes.ok || !teachersRes.ok || !tariffsRes.ok) {
        throw new Error('Не удалось загрузить данные воронки');
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

  const tariffPackageOptions = useMemo(() => {
    return tariffs.flatMap((tariff) =>
      tariff.packages.map((pkg) => ({
        value: pkg.id,
        label: `${tariff.name}: ${pkg.lessons_count} занятий / ${pkg.total_price_rub} ₽`
      }))
    );
  }, [tariffs]);

  async function refreshSelectedCard(cardId: string) {
    const [cardRes, auditRes, linksRes] = await Promise.allSettled([
      fetch(`/api/v1/funnel/cards/${cardId}`, { cache: 'no-store' }),
      fetch(`/api/v1/funnel/cards/${cardId}/audit`, { cache: 'no-store' }),
      fetch(`/api/v1/funnel/cards/${cardId}/payment-links`, { cache: 'no-store' })
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
  }

  async function openCard(cardId: string) {
    const boardCard = cards.find((item) => item.id === cardId) ?? null;
    if (boardCard) {
      setSelectedCard(boardCard);
      setSelectedTeacherId(boardCard.assigned_teacher_id);
    }

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
    const response = await fetch(`/api/v1/funnel/cards/${cardId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode, lossReasonId: reasonId })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      api.error(payload?.message ?? 'Не удалось обновить этап');
      return;
    }

    await loadBoard();

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

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: selectedCard.first_name,
        lastName: selectedCard.last_name,
        phone: selectedCard.phone,
        contact: selectedCard.contact_link,
        email: selectedCard.email,
        leadSource: selectedCard.lead_source,
        comment: selectedCard.card_comment,
        startLessonsAt: selectedCard.start_lessons_at,
        lastLessonAt: selectedCard.last_lesson_at,
        paidLessonsLeft: selectedCard.paid_lessons_left
      })
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

  async function onAssignTeacher() {
    if (!selectedCard || !selectedTeacherId) return;

    setTeacherSaving(true);

    const response = await fetch(`/api/v1/funnel/cards/${selectedCard.id}/teacher`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: selectedTeacherId })
    });

    setTeacherSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      api.error(payload?.message ?? 'Не удалось назначить преподавателя');
      return;
    }

    api.success('Преподаватель назначен');
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
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[12, 12]} wrap={false} style={{ overflowX: 'auto', paddingBottom: 4 }}>
          {stages.map((stage) => {
            const stageCards = groupedCards.get(stage.code) ?? [];

            return (
              <Col key={stage.id} style={{ minWidth: 320 }}>
                <Card
                  title={stage.name}
                  extra={<Typography.Text type="secondary">{stageCards.length}</Typography.Text>}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedCardId) {
                      void onChangeStage(draggedCardId, stage.code);
                    }
                  }}
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {stageCards.map((card) => (
                      <Card
                        key={card.id}
                        size="small"
                        draggable
                        onDragStart={() => setDraggedCardId(card.id)}
                        onClick={() => void openCard(card.id)}
                        hoverable
                      >
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Typography.Text strong>{card.full_name}</Typography.Text>
                          <Typography.Text type="secondary">Преподаватель: {card.teacher_full_name ?? 'Не назначен'}</Typography.Text>
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

                    {stageCards.length === 0 ? <Typography.Text type="secondary">Нет карточек</Typography.Text> : null}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Drawer
        title={selectedCard ? `Карточка: ${selectedCard.full_name}` : 'Карточка'}
        open={drawerOpen}
        width={720}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCard(null);
        }}
      >
        {detailsLoading || !selectedCard ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="Данные карточки">
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
                <Col span={12}>
                  <Typography.Text>Дата следующего занятия</Typography.Text>
                  <Input value={selectedCard.next_lesson_at ? formatDate(selectedCard.next_lesson_at) : 'Из расписания преподавателя'} readOnly />
                </Col>
                <Col span={6}>
                  <Typography.Text>Осталось занятий</Typography.Text>
                  <InputNumber min={0} style={{ width: '100%' }} value={selectedCard.paid_lessons_left} onChange={(value) => setSelectedCard((prev) => (prev ? { ...prev, paid_lessons_left: Number(value) || 0 } : prev))} />
                </Col>
                <Col span={24}>
                  <Typography.Text>Комментарий</Typography.Text>
                  <Input.TextArea rows={2} value={selectedCard.card_comment ?? ''} onChange={(event) => setSelectedCard((prev) => (prev ? { ...prev, card_comment: event.target.value } : prev))} />
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

            <Card size="small" title="Назначить преподавателя">
              <Space>
                <Select
                  style={{ minWidth: 260 }}
                  value={selectedTeacherId}
                  onChange={(value) => setSelectedTeacherId(value)}
                  options={teachers.map((teacher) => ({ value: teacher.id, label: teacher.full_name }))}
                />
                <Button type="primary" loading={teacherSaving} onClick={() => void onAssignTeacher()}>
                  Назначить
                </Button>
              </Space>
            </Card>

            <Card size="small" title="Создать ссылку на оплату">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Select
                    style={{ minWidth: 360 }}
                    placeholder="Выберите тариф и пакет"
                    value={selectedTariffPackageId}
                    onChange={(value) => setSelectedTariffPackageId(value)}
                    options={tariffPackageOptions}
                  />
                  <Button type="primary" loading={paymentLinkCreating} onClick={() => void onCreatePaymentLink()}>
                    Создать ссылку
                  </Button>
                </Space>

                {paymentLinks.length === 0 ? (
                  <Typography.Text type="secondary">Ссылок оплаты пока нет</Typography.Text>
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {paymentLinks.map((item) => (
                      <Card key={item.id} size="small">
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space direction="vertical" size={0}>
                            <Typography.Text>
                              {item.amount} ₽ <Tag color={statusColor(item.status)}>{statusLabel(item.status)}</Tag>
                            </Typography.Text>
                            <Typography.Text type="secondary">{formatDate(item.created_at)}</Typography.Text>
                          </Space>
                          <a href={item.payment_url} target="_blank" rel="noreferrer">
                            Открыть
                          </a>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Space>
            </Card>

            <Card size="small" title="Лог (история изменений)">
              {auditItems.length === 0 ? (
                <Typography.Text type="secondary">Лог пуст</Typography.Text>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {auditItems.map((item) => (
                    <Card key={item.id} size="small">
                      <Space direction="vertical" size={0}>
                        <Typography.Text>
                          {item.action} • {item.actor_login ?? 'admin'}
                        </Typography.Text>
                        <Typography.Text type="secondary">{formatDate(item.created_at)}</Typography.Text>
                      </Space>
                    </Card>
                  ))}
                </Space>
              )}
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
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            placeholder="Выберите карточку"
            value={restoreCardId}
            onChange={(value) => setRestoreCardId(value)}
            options={archivedCards.map((card) => ({ value: card.id, label: `${card.full_name} (${card.stage_name})` }))}
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
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {archivedCards.map((item) => (
                <Card key={item.id} size="small">
                  <Space direction="vertical" size={0}>
                    <Typography.Text>{item.full_name}</Typography.Text>
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
