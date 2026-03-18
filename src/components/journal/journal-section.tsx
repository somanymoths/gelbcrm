'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, Modal, Row, Select, Space, Switch, Tag, Typography, message } from 'antd';

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

const DAYS: Array<{ weekday: number; short: string; full: string }> = [
  { weekday: 1, short: 'Пн', full: 'Понедельник' },
  { weekday: 2, short: 'Вт', full: 'Вторник' },
  { weekday: 3, short: 'Ср', full: 'Среда' },
  { weekday: 4, short: 'Чт', full: 'Четверг' },
  { weekday: 5, short: 'Пт', full: 'Пятница' },
  { weekday: 6, short: 'Сб', full: 'Суббота' },
  { weekday: 7, short: 'Вс', full: 'Воскресенье' }
];

export function JournalSection() {
  const [api, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [roleUser, setRoleUser] = useState<RoleUser | null>(null);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [weeklyTemplate, setWeeklyTemplate] = useState<WeeklySlot[]>([]);
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [dayDrafts, setDayDrafts] = useState<Record<number, DayDraft>>(() => createInitialDayDrafts());
  const [rescheduleState, setRescheduleState] = useState<{ slotId: string; date: string; time: string } | null>(null);

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

      const teacherItems = await fetchJson<TeacherItem[]>('/api/v1/journal/teachers');
      setTeachers(teacherItems);
      const nextTeacherId = selectedTeacherId ?? teacherItems[0]?.id ?? null;
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
      api.error(error instanceof Error ? error.message : 'Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [api, selectedTeacherId, weekStart]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
    setSavingTemplate(true);
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
      api.error(error instanceof Error ? error.message : 'Не удалось сохранить шаблон');
      throw error;
    } finally {
      setSavingTemplate(false);
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

  const removeTemplateSlot = async (weekday: number, startTime: string) => {
    const exists = weeklyTemplate.some((slot) => slot.weekday === weekday && slot.start_time === startTime);
    if (!exists) return;
    const nextTemplate = weeklyTemplate.filter((slot) => !(slot.weekday === weekday && slot.start_time === startTime));
    await saveTemplate(nextTemplate);
    await refreshWeekSlots();
  };

  const createSlotForDay = async (weekday: number, date: string) => {
    if (!selectedTeacherId) return;
    const draft = dayDrafts[weekday];
    if (!draft || !draft.time) return;

    try {
      if (draft.repeatWeekly) {
        await ensureTemplateSlot(weekday, draft.time);
        const nextSlots = (await refreshWeekSlots()) ?? [];
        const generated = nextSlots.find((slot) => slot.date === date && slot.start_time === draft.time);
        if (generated && draft.studentId) {
          await assignStudent(generated, draft.studentId);
        }
        api.success('Слот добавлен в шаблон и на неделю');
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
        api.success('Слот создан');
        await refreshWeekSlots();
      }
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Не удалось создать слот');
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
      api.error(error instanceof Error ? error.message : 'Не удалось назначить ученика');
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
      api.error(error instanceof Error ? error.message : 'Не удалось изменить статус');
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
      api.success('Занятие перенесено');
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Не удалось перенести занятие');
    }
  };

  const templateKeySet = useMemo(
    () => new Set(weeklyTemplate.map((slot) => `${slot.weekday}-${slot.start_time}`)),
    [weeklyTemplate]
  );

  const slotMapByDate = useMemo(() => {
    const map = new Map<string, LessonSlot[]>();
    for (const slot of slots) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date)!.push(slot);
    }
    for (const value of map.values()) {
      value.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [slots]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Журнал занятий
        </Typography.Title>
        <Typography.Text type="secondary">Недельный шаблон, свободные слоты, переносы и статусы.</Typography.Text>
      </div>

      <Space wrap>
        {roleUser?.role === 'admin' ? (
          <Select
            style={{ width: 320 }}
            placeholder="Преподаватель"
            value={selectedTeacherId ?? undefined}
            options={teachers.map((item) => ({ value: item.id, label: item.full_name }))}
            onChange={(value) => setSelectedTeacherId(value)}
          />
        ) : null}
        <Button onClick={() => setWeekStart(addDays(weekStart, -7))}>Предыдущая неделя</Button>
        <Button onClick={() => setWeekStart(getWeekStart(new Date()))}>Текущая неделя</Button>
        <Button onClick={() => setWeekStart(addDays(weekStart, 7))}>Следующая неделя</Button>
        <Tag color="blue">{`${toIsoDate(weekStart)} — ${toIsoDate(addDays(weekStart, 6))}`}</Tag>
      </Space>

      <Row gutter={[12, 12]}>
        {weekDays.map((day) => (
          <Col key={day.dateIso} xs={24} md={12} xl={8}>
            <Card title={`${day.short}, ${day.dateLabel}`} loading={loading}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Card size="small">
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Typography.Text strong>Новый слот</Typography.Text>
                    <Space wrap>
                      <Input
                        type="time"
                        value={dayDrafts[day.weekday]?.time ?? '10:00'}
                        onChange={(event) =>
                          setDayDrafts((prev) => ({
                            ...prev,
                            [day.weekday]: { ...(prev[day.weekday] ?? createDayDraft()), time: event.target.value }
                          }))
                        }
                        style={{ width: 130 }}
                      />
                      <Select
                        allowClear
                        style={{ width: 290 }}
                        value={dayDrafts[day.weekday]?.studentId ?? undefined}
                        options={students.map((item) => ({
                          value: item.id,
                          label: `${item.full_name} (остаток: ${item.paid_lessons_left})`
                        }))}
                        placeholder="Ученик (опционально)"
                        onChange={(value) =>
                          setDayDrafts((prev) => ({
                            ...prev,
                            [day.weekday]: { ...(prev[day.weekday] ?? createDayDraft()), studentId: value ?? null }
                          }))
                        }
                      />
                    </Space>
                    <Space wrap>
                      <Switch
                        checked={dayDrafts[day.weekday]?.repeatWeekly ?? false}
                        onChange={(checked) =>
                          setDayDrafts((prev) => ({
                            ...prev,
                            [day.weekday]: { ...(prev[day.weekday] ?? createDayDraft()), repeatWeekly: checked }
                          }))
                        }
                      />
                      <Typography.Text type="secondary">Повторять каждую неделю (шаблон)</Typography.Text>
                      <Button type="primary" onClick={() => void createSlotForDay(day.weekday, day.dateIso)} disabled={!selectedTeacherId}>
                        Добавить
                      </Button>
                    </Space>
                  </Space>
                </Card>
                {(slotMapByDate.get(day.dateIso) ?? []).length === 0 ? (
                  <Typography.Text type="secondary">Нет слотов</Typography.Text>
                ) : (
                  (slotMapByDate.get(day.dateIso) ?? []).map((slot) => (
                    <Card key={slot.id} size="small">
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space>
                          <Tag color="geekblue">{slot.start_time}</Tag>
                          <Tag color={statusColor(slot.status)}>{statusLabel(slot.status)}</Tag>
                          {templateKeySet.has(`${day.weekday}-${slot.start_time}`) ? <Tag color="purple">Шаблон</Tag> : null}
                        </Space>
                        <Select
                          allowClear
                          value={slot.student_id ?? undefined}
                          placeholder="Выберите ученика"
                          options={students.map((item) => ({
                            value: item.id,
                            label: `${item.full_name} (остаток: ${item.paid_lessons_left})`
                          }))}
                          onChange={(value) => void assignStudent(slot, value ?? null)}
                        />
                        <Space wrap>
                          <Button size="small" onClick={() => void setStatus(slot, 'planned')}>
                            Запланировано
                          </Button>
                          <Button size="small" type="primary" onClick={() => void setStatus(slot, 'completed')}>
                            Подтвердить
                          </Button>
                          <Button size="small" danger onClick={() => void setStatus(slot, 'canceled')}>
                            Отменить
                          </Button>
                          <Button
                            size="small"
                            onClick={() =>
                              setRescheduleState({
                                slotId: slot.id,
                                date: slot.date,
                                time: slot.start_time
                              })
                            }
                          >
                            Перенести
                          </Button>
                          {templateKeySet.has(`${day.weekday}-${slot.start_time}`) ? (
                            <Button size="small" loading={savingTemplate} onClick={() => void removeTemplateSlot(day.weekday, slot.start_time)}>
                              Убрать из шаблона
                            </Button>
                          ) : (
                            <Button size="small" loading={savingTemplate} onClick={() => void ensureTemplateSlot(day.weekday, slot.start_time)}>
                              Сделать шаблоном
                            </Button>
                          )}
                        </Space>
                      </Space>
                    </Card>
                  ))
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        open={Boolean(rescheduleState)}
        title="Перенести занятие"
        onCancel={() => setRescheduleState(null)}
        onOk={() => void submitReschedule()}
        okText="Сохранить перенос"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            type="date"
            value={rescheduleState?.date ?? ''}
            onChange={(event) =>
              setRescheduleState((prev) => (prev ? { ...prev, date: event.target.value } : prev))
            }
          />
          <Input
            type="time"
            value={rescheduleState?.time ?? ''}
            onChange={(event) =>
              setRescheduleState((prev) => (prev ? { ...prev, time: event.target.value } : prev))
            }
          />
        </Space>
      </Modal>
    </Space>
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
    repeatWeekly: false
  };
}

function statusLabel(status: LessonStatus): string {
  if (status === 'completed') return 'Подтверждено';
  if (status === 'rescheduled') return 'Перенесено';
  if (status === 'canceled') return 'Отменено';
  return 'Запланировано';
}

function statusColor(status: LessonStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'rescheduled') return 'processing';
  if (status === 'canceled') return 'error';
  return 'default';
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
