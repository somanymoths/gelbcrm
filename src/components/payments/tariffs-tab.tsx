'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Dropdown, Form, Input, InputNumber, Modal, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, LinkOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { formatDateTime, formatRub } from '@/lib/payments/format';
import {
  getPackageTotal,
  getStoreUpdateEventName,
  getTariffPaymentLink,
  getTariffs,
  removeTariff,
  renameTariff,
  saveTariff,
  type Tariff
} from '@/lib/payments/store';

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

export function TariffsTab() {
  const [form] = Form.useForm<{ name: string }>();
  const [renameForm] = Form.useForm<{ name: string }>();
  const [packages, setPackages] = useState<NewPackage[]>([createEmptyPackage()]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [createdLink, setCreatedLink] = useState<string>('');
  const [renameTarget, setRenameTarget] = useState<Tariff | null>(null);
  const [modal, modalContextHolder] = Modal.useModal();
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    const read = () => setTariffs(getTariffs());

    read();
    window.addEventListener(getStoreUpdateEventName(), read);

    return () => window.removeEventListener(getStoreUpdateEventName(), read);
  }, []);

  const canCreate = useMemo(
    () =>
      packages.length > 0 &&
      packages.every((item) => item.lessonsCount > 0 && item.pricePerLesson > 0),
    [packages]
  );

  const handlePackageChange = (key: string, field: 'lessonsCount' | 'pricePerLesson', value: number | null) => {
    setPackages((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: Math.max(0, Number(value) || 0) } : item))
    );
  };

  const handleCreateTariff = async () => {
    try {
      const values = await form.validateFields();

      if (!canCreate) {
        api.error('Проверьте пакеты: количество занятий и цена должны быть больше 0.');
        return;
      }

      const tariff = saveTariff({
        name: values.name,
        packages: packages.map((item) => ({
          lessonsCount: item.lessonsCount,
          pricePerLesson: item.pricePerLesson
        }))
      });

      const paymentLink = getTariffPaymentLink(tariff.paymentLinkSlug);
      setCreatedLink(paymentLink);

      setPackages([createEmptyPackage()]);
      form.resetFields();
      api.success('Тариф создан, ссылка на оплату сформирована.');
    } catch {
      // form validation error
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      api.success('Ссылка скопирована.');
    } catch {
      api.error('Не удалось скопировать ссылку.');
    }
  };

  const openRenameModal = (tariff: Tariff) => {
    setRenameTarget(tariff);
    renameForm.setFieldsValue({ name: tariff.name });
  };

  const submitRename = async () => {
    if (!renameTarget) {
      return;
    }

    try {
      const values = await renameForm.validateFields();
      const updated = renameTariff({ tariffId: renameTarget.id, name: values.name });

      if (!updated) {
        api.error('Не удалось переименовать тариф.');
        return;
      }

      setRenameTarget(null);
      renameForm.resetFields();
      api.success('Тариф переименован.');
    } catch {
      // form validation error
    }
  };

  const confirmDeleteTariff = (tariff: Tariff) => {
    modal.confirm({
      title: 'Удалить тариф?',
      content: `Тариф «${tariff.name}» будет удален без возможности восстановления.`,
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => {
        const removed = removeTariff(tariff.id);

        if (!removed) {
          api.error('Не удалось удалить тариф.');
          return;
        }

        api.success('Тариф удален.');
      }
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      {modalContextHolder}

      <Card title="Новый тариф">
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
            {packages.map((pkg, index) => {
              const total = getPackageTotal(pkg);

              return (
                <Card
                  key={pkg.key}
                  size="small"
                  extra={
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setPackages((prev) => prev.filter((item) => item.key !== pkg.key))}
                      disabled={packages.length === 1}
                    >
                      Удалить
                    </Button>
                  }
                >
                  <Space wrap size={12}>
                    <Typography.Text>Пакет {index + 1}</Typography.Text>
                    <Space size={6}>
                      <InputNumber
                        min={1}
                        value={pkg.lessonsCount}
                        onChange={(value) => handlePackageChange(pkg.key, 'lessonsCount', value)}
                      />
                      <Typography.Text type="secondary">занятий</Typography.Text>
                    </Space>
                    <Space size={6}>
                      <InputNumber
                        min={1}
                        value={pkg.pricePerLesson}
                        onChange={(value) => handlePackageChange(pkg.key, 'pricePerLesson', value)}
                      />
                      <Typography.Text type="secondary">₽/занятие</Typography.Text>
                    </Space>
                    <Typography.Text strong>{formatRub(total)}</Typography.Text>
                  </Space>
                </Card>
              );
            })}
          </Space>

          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => setPackages((prev) => [...prev, createEmptyPackage()])}>
              Добавить пакет
            </Button>
            <Button type="primary" onClick={handleCreateTariff} disabled={!canCreate}>
              Создать тариф и ссылку оплаты
            </Button>
          </Space>

          {createdLink && (
            <Card size="small" title="Ссылка на оплату" style={{ background: '#fafafa' }}>
              <Space wrap>
                <Typography.Text copyable={{ text: createdLink }}>{createdLink}</Typography.Text>
                <Button icon={<LinkOutlined />} onClick={() => handleCopyLink(createdLink)}>
                  Копировать
                </Button>
              </Space>
            </Card>
          )}
        </Space>
      </Card>

      <Card title="Созданные тарифы">
        <Table<Tariff>
          rowKey="id"
          pagination={false}
          dataSource={tariffs}
          locale={{ emptyText: 'Пока нет тарифов' }}
          columns={[
            {
              title: 'Тариф',
              dataIndex: 'name',
              key: 'name'
            },
            {
              title: 'Пакеты',
              key: 'packages',
              render: (_, tariff) => (
                <Space orientation="vertical" size={0}>
                  {tariff.packages.map((pkg) => (
                    <Typography.Text key={pkg.id}>{`${pkg.lessonsCount} занятий x ${formatRub(pkg.pricePerLesson)} = ${formatRub(getPackageTotal(pkg))}`}</Typography.Text>
                  ))}
                </Space>
              )
            },
            {
              title: 'Ссылка оплаты',
              key: 'link',
              render: (_, tariff) => {
                const link = getTariffPaymentLink(tariff.paymentLinkSlug);

                return (
                  <Space wrap>
                    <Typography.Text>{link}</Typography.Text>
                    <Button size="small" onClick={() => handleCopyLink(link)}>
                      Копировать
                    </Button>
                  </Space>
                );
              }
            },
            {
              title: 'Создан',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (value: string) => formatDateTime(value)
            },
            {
              title: '',
              key: 'actions',
              width: 64,
              render: (_, tariff) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'rename', label: 'Переименовать' },
                      { key: 'delete', label: 'Удалить', danger: true }
                    ],
                    onClick: ({ key }) => {
                      if (key === 'rename') {
                        openRenameModal(tariff);
                        return;
                      }

                      if (key === 'delete') {
                        confirmDeleteTariff(tariff);
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
    </Space>
  );
}
