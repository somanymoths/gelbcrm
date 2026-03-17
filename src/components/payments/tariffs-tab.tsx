'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { formatDateTime, formatRub } from '@/lib/payments/format';

type TariffPackage = {
  id: string;
  tariff_grid_id: string;
  lessons_count: number;
  price_per_lesson_rub: number;
  total_price_rub: number;
  is_active: 0 | 1;
  created_at: string;
};

type TariffGrid = {
  id: string;
  name: string;
  is_active: 0 | 1;
  created_at: string;
  packages: TariffPackage[];
};

type NewPackage = {
  key: string;
  lessonsCount: number;
  pricePerLesson: number;
};

function createEmptyPackage(): NewPackage {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonsCount: 4,
    pricePerLesson: 1000
  };
}

function getPackageTotal(pkg: { lessonsCount: number; pricePerLesson: number }) {
  return pkg.lessonsCount * pkg.pricePerLesson;
}

export function TariffsTab() {
  const [form] = Form.useForm<{ name: string }>();
  const [renameForm] = Form.useForm<{ name: string }>();
  const [addPackageForm] = Form.useForm<{ lessonsCount: number; pricePerLessonRub: number }>();
  const [api, contextHolder] = message.useMessage();

  const [tariffs, setTariffs] = useState<TariffGrid[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [packages, setPackages] = useState<NewPackage[]>([createEmptyPackage()]);

  const [renameTarget, setRenameTarget] = useState<TariffGrid | null>(null);
  const [addPackageTarget, setAddPackageTarget] = useState<TariffGrid | null>(null);

  const canCreate = useMemo(
    () => packages.length > 0 && packages.every((item) => item.lessonsCount > 0 && item.pricePerLesson > 0),
    [packages]
  );

  const loadTariffs = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/v1/tariff-grids', { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as TariffGrid[] | null;

      if (!response.ok || !data) {
        api.error('Не удалось загрузить тарифы');
        setTariffs([]);
        return;
      }

      setTariffs(data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadTariffs();
  }, [loadTariffs]);

  const handlePackageChange = (key: string, field: 'lessonsCount' | 'pricePerLesson', value: number | null) => {
    setPackages((prev) => prev.map((item) => (item.key === key ? { ...item, [field]: Math.max(0, Number(value) || 0) } : item)));
  };

  const handleCreateTariff = async () => {
    try {
      const values = await form.validateFields();

      if (!canCreate) {
        api.error('Проверьте пакеты: количество занятий и цена должны быть больше 0.');
        return;
      }

      setCreating(true);

      const response = await fetch('/api/v1/tariff-grids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          packages: packages.map((item) => ({
            lessonsCount: item.lessonsCount,
            pricePerLessonRub: item.pricePerLesson
          }))
        })
      });

      setCreating(false);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        api.error(payload?.message ?? 'Не удалось создать тариф');
        return;
      }

      setPackages([createEmptyPackage()]);
      form.resetFields();
      api.success('Тариф создан');
      await loadTariffs();
    } catch {
      setCreating(false);
    }
  };

  const openRenameModal = (tariff: TariffGrid) => {
    setRenameTarget(tariff);
    renameForm.setFieldsValue({ name: tariff.name });
  };

  const submitRename = async () => {
    if (!renameTarget) return;

    try {
      const values = await renameForm.validateFields();
      const response = await fetch(`/api/v1/tariff-grids/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.name })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        api.error(payload?.message ?? 'Не удалось переименовать тариф');
        return;
      }

      setRenameTarget(null);
      renameForm.resetFields();
      api.success('Тариф переименован');
      await loadTariffs();
    } catch {
      // validation error
    }
  };

  const openAddPackageModal = (tariff: TariffGrid) => {
    setAddPackageTarget(tariff);
    addPackageForm.setFieldsValue({ lessonsCount: 4, pricePerLessonRub: 1000 });
  };

  const submitAddPackage = async () => {
    if (!addPackageTarget) return;

    try {
      const values = await addPackageForm.validateFields();
      const response = await fetch(`/api/v1/tariff-grids/${addPackageTarget.id}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        api.error(payload?.message ?? 'Не удалось добавить пакет');
        return;
      }

      setAddPackageTarget(null);
      addPackageForm.resetFields();
      api.success('Пакет добавлен');
      await loadTariffs();
    } catch {
      // validation error
    }
  };

  const deleteTariffGrid = async (tariff: TariffGrid) => {
    Modal.confirm({
      title: `Удалить тариф «${tariff.name}»?`,
      content: 'Тарифная сетка будет удалена без возможности восстановления.',
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: async () => {
        const response = await fetch(`/api/v1/tariff-grids/${tariff.id}`, { method: 'DELETE' });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          api.error(payload?.message ?? 'Не удалось удалить тариф');
          return;
        }

        api.success('Тариф удалён');
        await loadTariffs();
      }
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}

      <Card title="Новый тариф (серверный)">
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Form form={form} layout="vertical">
            <Form.Item
              label="Название тарифа"
              name="name"
              rules={[{ required: true, message: 'Введите название тарифа' }]}
              style={{ marginBottom: 8 }}
            >
              <Input placeholder="Например: Базовый английский" />
            </Form.Item>
          </Form>

          <Typography.Text strong>Пакеты</Typography.Text>

          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {packages.map((pkg, index) => (
              <Card key={pkg.key} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', flexWrap: 'wrap' }}>
                  <Space wrap size={12}>
                    <Typography.Text>Пакет {index + 1}</Typography.Text>
                    <Space size={6}>
                      <InputNumber min={1} value={pkg.lessonsCount} onChange={(value) => handlePackageChange(pkg.key, 'lessonsCount', value)} />
                      <Typography.Text type="secondary">занятий</Typography.Text>
                    </Space>
                    <Space size={6}>
                      <InputNumber min={1} value={pkg.pricePerLesson} onChange={(value) => handlePackageChange(pkg.key, 'pricePerLesson', value)} />
                      <Typography.Text type="secondary">₽/занятие</Typography.Text>
                    </Space>
                    <Typography.Text strong>{formatRub(getPackageTotal(pkg))}</Typography.Text>
                  </Space>
                  <Button
                    type="text"
                    danger
                    onClick={() => setPackages((prev) => prev.filter((item) => item.key !== pkg.key))}
                    disabled={packages.length === 1}
                  >
                    Удалить
                  </Button>
                </div>
              </Card>
            ))}
          </Space>

          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => setPackages((prev) => [...prev, createEmptyPackage()])}>
              Добавить пакет
            </Button>
            <Button type="primary" onClick={handleCreateTariff} disabled={!canCreate} loading={creating}>
              Создать тариф
            </Button>
            <Button onClick={() => void loadTariffs()} loading={loading}>
              Обновить список
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="Тарифные сетки">
        <Table<TariffGrid>
          rowKey="id"
          loading={loading}
          pagination={false}
          dataSource={tariffs}
          locale={{ emptyText: 'Пока нет тарифов' }}
          columns={[
            {
              title: 'Тариф',
              dataIndex: 'name',
              key: 'name',
              render: (_, row) => <Typography.Text>{row.name}</Typography.Text>
            },
            {
              title: 'Пакеты',
              key: 'packages',
              render: (_, tariff) => (
                <Space orientation="vertical" size={2}>
                  {tariff.packages.length === 0 ? <Typography.Text type="secondary">Нет пакетов</Typography.Text> : null}
                  {tariff.packages.map((pkg) => (
                    <Space key={pkg.id}>
                      <Typography.Text>
                        {pkg.lessons_count} занятий x {formatRub(pkg.price_per_lesson_rub)} = {formatRub(pkg.total_price_rub)}
                      </Typography.Text>
                      {pkg.is_active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>}
                    </Space>
                  ))}
                </Space>
              )
            },
            {
              title: 'Создан',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (value: string) => formatDateTime(value)
            },
            {
              title: '',
              key: 'actions',
              width: 72,
              render: (_, tariff) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'rename', label: 'Переименовать' },
                      { key: 'add-package', label: 'Добавить пакет' },
                      { key: 'delete', label: 'Удалить тариф', danger: true }
                    ],
                    onClick: ({ key }) => {
                      if (key === 'rename') {
                        openRenameModal(tariff);
                        return;
                      }

                      if (key === 'add-package') {
                        openAddPackageModal(tariff);
                        return;
                      }

                      if (key === 'delete') {
                        void deleteTariffGrid(tariff);
                      }
                    }
                  }}
                >
                  <Button type="text" icon={<MoreOutlined />} aria-label="Действия с тарифом" />
                </Dropdown>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title="Переименовать тариф"
        open={Boolean(renameTarget)}
        onCancel={() => {
          setRenameTarget(null);
          renameForm.resetFields();
        }}
        onOk={() => void submitRename()}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item
            name="name"
            label="Название тарифа"
            rules={[{ required: true, message: 'Введите название тарифа' }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="Новое название тарифа" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Добавить пакет${addPackageTarget ? `: ${addPackageTarget.name}` : ''}`}
        open={Boolean(addPackageTarget)}
        onCancel={() => {
          setAddPackageTarget(null);
          addPackageForm.resetFields();
        }}
        onOk={() => void submitAddPackage()}
        okText="Добавить"
        cancelText="Отмена"
      >
        <Form form={addPackageForm} layout="vertical">
          <Form.Item
            name="lessonsCount"
            label="Количество занятий"
            rules={[{ required: true, message: 'Укажите количество занятий' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="pricePerLessonRub"
            label="Цена за занятие (₽)"
            rules={[{ required: true, message: 'Укажите цену за занятие' }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
