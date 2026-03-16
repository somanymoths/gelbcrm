'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from 'antd';
import type { TableProps } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';

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

const PHONE_MASK_REGEX = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;
const FLAG_OPTIONS = ['🇬🇧', '🇩🇪', '🇪🇸', '🇫🇷', '🇮🇹', '🇷🇺', '🇺🇸', '🇵🇹', '🇨🇳', '🇯🇵', '🇰🇷', '🇹🇷'];

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

export function TeachersSection({ scope }: { scope: Scope }) {
  const { message, notification, modal } = App.useApp();
  const [form] = Form.useForm<TeacherFormValues>();
  const [createForm] = Form.useForm<TeacherFormValues>();

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
  const [newFilterLanguageFlag, setNewFilterLanguageFlag] = useState<string | undefined>(undefined);
  const [creatingFilterLanguage, setCreatingFilterLanguage] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TeacherDetails | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
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
        value: lang.id,
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

    form.setFieldsValue({
      firstName: detail.first_name,
      lastName: detail.last_name,
      languageId: detail.language_id,
      rateRub: detail.rate_rub,
      telegramRaw: detail.telegram_raw,
      phone: formatPhoneInput(detail.phone),
      comment: detail.comment
    });
  }, [detail, form, isEditing]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || nextOffset === null) return;
    await fetchTeachers(nextOffset, true);
  }, [fetchTeachers, loading, loadingMore, nextOffset]);

  const openTeacher = useCallback(
    async (teacherId: string) => {
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
        message.error(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки');
        setDetailOpen(false);
      } finally {
        setDetailLoading(false);
      }
    },
    [message]
  );

  const onTableScroll: TableProps<Teacher>['onScroll'] = (event) => {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 120) {
      void loadMore();
    }
  };

  async function addLanguageFromFilter() {
    const name = newFilterLanguageName.trim();
    if (!name) {
      message.warning('Введите название языка');
      return;
    }

    setCreatingFilterLanguage(true);
    try {
      const response = await fetch('/api/v1/school/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, flagEmoji: newFilterLanguageFlag ?? null })
      });

      if (response.status === 409) {
        const refreshed = await fetchLanguages();
        const existing = refreshed.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          setLanguageId(existing.id);
          setNewFilterLanguageName('');
          setNewFilterLanguageFlag(existing.flag_emoji ?? undefined);
        }
        message.warning('Такой язык уже существует');
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
      setNewFilterLanguageFlag(created.flag_emoji ?? undefined);
      message.success('Язык добавлен');
    } catch (addError) {
      message.error(addError instanceof Error ? addError.message : 'Не удалось добавить язык');
    } finally {
      setCreatingFilterLanguage(false);
    }
  }

  async function saveTeacher(id: string) {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const response = await fetch(`/api/v1/teachers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось сохранить преподавателя');
      }

      const updated = (await response.json()) as TeacherDetails;
      setDetail(updated);
      setIsEditing(false);
      message.success('Сохранён');
      await fetchTeachers(0, false);
    } catch (saveError) {
      if (saveError instanceof Error) {
        message.error(saveError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function createTeacher() {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);

      const response = await fetch('/api/v1/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось создать преподавателя');
      }

      createForm.resetFields();
      setCreateOpen(false);
      message.success('Создан');
      await fetchTeachers(0, false);
    } catch (createError) {
      if (createError instanceof Error) {
        message.error(createError.message);
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

    message.success('Архивирован');
    notification.open({
      message: 'Преподаватель архивирован',
      description: 'Можно отменить действие в течение 9 секунд.',
      duration: 9,
      btn: (
        <Button
          size="small"
          onClick={() => {
            void restoreTeacherById(teacherId);
            notification.destroy();
          }}
        >
          Undo
        </Button>
      )
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

    message.success('Восстановлен');
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
      message.error(fetchError instanceof Error ? fetchError.message : 'Ошибка загрузки зависимостей');
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
      message.error(payload?.message ?? 'Не удалось отвязать учеников');
      return;
    }

    await openDeleteModal(deleteTeacher);
  }

  async function deletePermanently(teacher: Teacher) {
    const response = await fetch(`/api/v1/teachers/${teacher.id}`, { method: 'DELETE' });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      message.error(payload?.message ?? 'Не удалось удалить преподавателя');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    message.success('Удалён навсегда');
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
      message.error(payload?.message ?? 'Не удалось отвязать всех учеников');
      return;
    }

    setDeleteOpen(false);
    setDeleteTeacher(null);
    message.success('Удалён навсегда');
    await fetchTeachers(0, false);
  }

  const columns: TableProps<Teacher>['columns'] = [
    {
      title: 'Имя',
      dataIndex: 'full_name',
      key: 'name',
      sorter: true,
      sortOrder: sortBy === 'name' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (_, row) => row.full_name
    },
    {
      title: 'Ученики',
      dataIndex: 'active_students_count',
      key: 'students',
      width: 120,
      sorter: true,
      sortOrder: sortBy === 'students' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (value: number) => value
    },
    {
      title: 'Контакты',
      key: 'contacts',
      render: (_, row) => row.telegram_display ?? 'Нет контакта'
    },
    {
      title: 'Язык',
      dataIndex: 'language_name',
      key: 'language_name',
      width: 160,
      render: (_: string | null, row) =>
        row.language_name ? `${row.language_flag_emoji ? `${row.language_flag_emoji} ` : ''}${row.language_name}` : '—'
    },
    {
      title: 'Ставка',
      dataIndex: 'rate_rub',
      key: 'rate',
      width: 130,
      sorter: true,
      sortOrder: sortBy === 'rate' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (value: number | null) => (value === null ? '—' : `${value} ₽`)
    },
    {
      title: '⋯',
      key: 'menu',
      width: 60,
      render: (_, row) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items:
              scope === 'active'
                ? [
                    { key: 'open', label: 'Открыть' },
                    { key: 'archive', label: 'Архивировать' }
                  ]
                : [
                    { key: 'open', label: 'Открыть' },
                    { key: 'restore', label: 'Восстановить' },
                    { key: 'delete', label: 'Удалить навсегда', danger: true }
                  ],
            onClick: async ({ key }) => {
              if (key === 'open') {
                await openTeacher(row.id);
                return;
              }

              if (key === 'archive') {
                try {
                  await archiveTeacherById(row.id);
                } catch (error) {
                  message.error(error instanceof Error ? error.message : 'Не удалось архивировать преподавателя');
                }
                return;
              }

              if (key === 'restore') {
                try {
                  await restoreTeacherById(row.id);
                } catch (error) {
                  message.error(error instanceof Error ? error.message : 'Не удалось восстановить преподавателя');
                }
                return;
              }

              if (key === 'delete') {
                await openDeleteModal(row);
              }
            }
          }}
        >
          <Button
            icon={<MoreOutlined />}
            type="text"
            onClick={(event) => {
              event.stopPropagation();
            }}
          />
        </Dropdown>
      )
    }
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {scope === 'active' ? 'Преподаватели' : 'Архив преподавателей'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {scope === 'active' ? 'Активные преподаватели' : 'Архивные преподаватели'}
          </Typography.Text>
        </div>

        <Space>
          {scope === 'active' ? (
            <>
              <Link href="/teachers/archive">
                <Button>Перейти в архив</Button>
              </Link>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Добавить преподавателя
              </Button>
            </>
          ) : (
            <Link href="/teachers">
              <Button>К активным</Button>
            </Link>
          )}
        </Space>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="Поиск по имени и фамилии"
            style={{ width: 320 }}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />

          <Select
            allowClear
            placeholder="Язык"
            style={{ width: 220 }}
            value={languageId ?? undefined}
            options={languageOptions}
            onChange={(value) => setLanguageId((value as number | undefined) ?? null)}
            dropdownRender={(menu) => (
              <>
                {menu}
                <div
                  style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      style={{ width: 88 }}
                      allowClear
                      placeholder="🏳️"
                      value={newFilterLanguageFlag}
                      options={FLAG_OPTIONS.map((flag) => ({ value: flag, label: flag }))}
                      onChange={(value) => setNewFilterLanguageFlag(value)}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <Input
                      placeholder="Новый язык"
                      value={newFilterLanguageName}
                      onChange={(event) => setNewFilterLanguageName(event.target.value)}
                      onPressEnter={() => void addLanguageFromFilter()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                        }
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                    <Button
                      loading={creatingFilterLanguage}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void addLanguageFromFilter();
                      }}
                    >
                      Добавить
                    </Button>
                  </Space.Compact>
                </div>
              </>
            )}
          />

          <Tag>
            Показано: {items.length} / {total}
          </Tag>
        </Space>

        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            action={
              <Button size="small" onClick={() => void fetchTeachers(0, false)}>
                Повторить
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <Table<Teacher>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          onScroll={onTableScroll}
          scroll={{ y: 560 }}
          onChange={(pagination, filters, sorter) => {
            const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
            if (!singleSorter?.columnKey || !singleSorter.order) {
              setSortBy('createdAt');
              setSortDir('desc');
              return;
            }

            if (singleSorter.columnKey === 'name') setSortBy('name');
            if (singleSorter.columnKey === 'students') setSortBy('students');
            if (singleSorter.columnKey === 'rate') setSortBy('rate');

            setSortDir(singleSorter.order === 'ascend' ? 'asc' : 'desc');
          }}
          onRow={(row) => ({
            onClick: () => {
              void openTeacher(row.id);
            }
          })}
          locale={{
            emptyText: loading ? 'Загрузка...' : 'Нет преподавателей'
          }}
        />

        {loadingMore ? <Typography.Text type="secondary">Загрузка...</Typography.Text> : null}
      </Card>

      <Modal
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
          setIsEditing(false);
        }}
        width={780}
        title={detail ? detail.full_name : 'Преподаватель'}
        footer={null}
        destroyOnHidden
        maskClosable
        keyboard
      >
        {detailLoading || !detail ? (
          <Typography.Text type="secondary">Загрузка...</Typography.Text>
        ) : (
          <Space orientation="vertical" style={{ width: '100%' }} size={16}>
            {!isEditing ? (
              <>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Имя">{detail.first_name}</Descriptions.Item>
                  <Descriptions.Item label="Фамилия">{detail.last_name}</Descriptions.Item>
                  <Descriptions.Item label="Язык">
                    {detail.language_name
                      ? `${detail.language_flag_emoji ? `${detail.language_flag_emoji} ` : ''}${detail.language_name}`
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Ставка">{detail.rate_rub === null ? '—' : `${detail.rate_rub} ₽`}</Descriptions.Item>
                  <Descriptions.Item label="Telegram">{detail.telegram_display ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Телефон">{detail.phone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Комментарий">{detail.comment ?? '—'}</Descriptions.Item>
                </Descriptions>

                <Card title={`Ученики (${detail.students.length})`} size="small">
                  {detail.students.length === 0 ? (
                    <Typography.Text type="secondary">Нет учеников</Typography.Text>
                  ) : (
                    <Space orientation="vertical" size={4}>
                      {detail.students.map((student) => (
                        <Typography.Text key={student.id}>{student.full_name}</Typography.Text>
                      ))}
                    </Space>
                  )}
                </Card>

                <Space>
                  {scope === 'active' ? (
                    <>
                      <Button onClick={() => setIsEditing(true)}>Редактировать</Button>
                      <Button
                        onClick={async () => {
                          try {
                            await archiveTeacherById(detail.id);
                          } catch (error) {
                            message.error(error instanceof Error ? error.message : 'Не удалось архивировать преподавателя');
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
                            message.error(error instanceof Error ? error.message : 'Не удалось восстановить преподавателя');
                          }
                        }}
                      >
                        Восстановить
                      </Button>
                      <Button danger onClick={() => void openDeleteModal(detail)}>
                        Удалить навсегда
                      </Button>
                    </>
                  )}
                </Space>
              </>
            ) : (
              <>
                <Form<TeacherFormValues> form={form} layout="vertical">
                  <Space style={{ width: '100%' }} align="start" wrap>
                    <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Укажите имя' }]} style={{ minWidth: 220 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Укажите фамилию' }]} style={{ minWidth: 220 }}>
                      <Input />
                    </Form.Item>
                  </Space>

                  <Space style={{ width: '100%' }} align="start" wrap>
                    <Form.Item name="languageId" label="Язык" style={{ minWidth: 220 }}>
                      <Select allowClear options={languageOptions} placeholder="Выберите язык" />
                    </Form.Item>
                    <Form.Item name="rateRub" label="Ставка (₽)" style={{ minWidth: 220 }}>
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>

                  <Space style={{ width: '100%' }} align="start" wrap>
                    <Form.Item name="telegramRaw" label="Telegram" style={{ minWidth: 220 }}>
                      <Input placeholder="@username или https://t.me/username" />
                    </Form.Item>
                    <Form.Item
                      name="phone"
                      label="Телефон"
                      rules={[
                        {
                          validator: async (_, value: string | undefined) => {
                            if (!value) return;
                            if (!PHONE_MASK_REGEX.test(value)) {
                              throw new Error('Формат: +7 999 999 99 99');
                            }
                          }
                        }
                      ]}
                      style={{ minWidth: 220 }}
                    >
                      <Input
                        placeholder="+7 (999) 999-99-99"
                        inputMode="numeric"
                        maxLength={18}
                        onChange={(event) => {
                          form.setFieldValue('phone', formatPhoneInput(event.target.value));
                        }}
                      />
                    </Form.Item>
                  </Space>

                  <Form.Item name="comment" label="Комментарий" rules={[{ max: 1000, message: 'Максимум 1000 символов' }]}>
                    <Input.TextArea rows={4} showCount maxLength={1000} />
                  </Form.Item>
                </Form>

                <Space>
                  <Button type="primary" loading={submitting} onClick={() => void saveTeacher(detail.id)}>
                    Сохранить
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      form.setFieldsValue({
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
                </Space>
              </>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        open={createOpen}
        title="Добавить преподавателя"
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => void createTeacher()}
        confirmLoading={submitting}
        okText="Создать"
      >
        <Form<TeacherFormValues> form={createForm} layout="vertical">
          <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Укажите имя' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Укажите фамилию' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="languageId" label="Язык">
            <Select allowClear options={languageOptions} placeholder="Выберите язык" />
          </Form.Item>
          <Form.Item name="rateRub" label="Ставка (₽)">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="telegramRaw" label="Telegram">
            <Input placeholder="@username или https://t.me/username" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Телефон"
            rules={[
              {
                validator: async (_, value: string | undefined) => {
                  if (!value) return;
                  if (!PHONE_MASK_REGEX.test(value)) {
                    throw new Error('Формат: +7 999 999 99 99');
                  }
                }
              }
            ]}
          >
            <Input
              placeholder="+7 (999) 999-99-99"
              inputMode="numeric"
              maxLength={18}
              onChange={(event) => {
                createForm.setFieldValue('phone', formatPhoneInput(event.target.value));
              }}
            />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий" rules={[{ max: 1000, message: 'Максимум 1000 символов' }]}>
            <Input.TextArea rows={4} showCount maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={deleteTeacher ? `Удалить преподавателя: ${deleteTeacher.full_name}` : 'Удалить преподавателя'}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTeacher(null);
          setDependencies([]);
          setSelectedStudentIds([]);
        }}
        footer={null}
      >
        {dependenciesLoading ? (
          <Typography.Text type="secondary">Загрузка...</Typography.Text>
        ) : !deleteTeacher ? null : (
          <Space orientation="vertical" style={{ width: '100%' }}>
            {dependencies.length === 0 ? (
              <>
                <Typography.Text>Привязанных учеников нет. Можно удалить преподавателя навсегда.</Typography.Text>
                <Button
                  danger
                  onClick={() => {
                    modal.confirm({
                      title: 'Удалить навсегда?',
                      content: 'Это действие нельзя отменить.',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        await deletePermanently(deleteTeacher);
                      }
                    });
                  }}
                >
                  Удалить навсегда
                </Button>
              </>
            ) : (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message="Удаление заблокировано: есть привязанные ученики"
                  description="Отвяжите выбранных или всех учеников, чтобы продолжить удаление."
                />

                <Checkbox.Group
                  style={{ width: '100%' }}
                  value={selectedStudentIds}
                  onChange={(values) => setSelectedStudentIds(values as string[])}
                >
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    {dependencies.map((student) => (
                      <Checkbox key={student.id} value={student.id}>
                        {student.full_name}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>

                <Space>
                  <Button disabled={selectedStudentIds.length === 0} onClick={() => void unbindSelected()}>
                    Отвязать выбранных
                  </Button>
                  <Button
                    danger
                    onClick={() => {
                      modal.confirm({
                        title: 'Отвязать всех и удалить?',
                        content: 'Все ученики будут отвязаны от преподавателя, после чего запись будет удалена навсегда.',
                        okButtonProps: { danger: true },
                        onOk: async () => {
                          await unbindAllAndDelete(deleteTeacher);
                        }
                      });
                    }}
                  >
                    Отвязать всех и удалить
                  </Button>
                </Space>
              </>
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
