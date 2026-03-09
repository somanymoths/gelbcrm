'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Skeleton, Space, Typography } from 'antd';

type FunnelStage = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  contact_link: string | null;
  phone: string | null;
  email: string | null;
  stage_code: string;
  stage_name: string;
};

type CreateFormState = {
  firstName: string;
  lastName: string;
  contactLink: string;
  phone: string;
  email: string;
};

const INITIAL_FORM: CreateFormState = {
  firstName: '',
  lastName: '',
  contactLink: '',
  phone: '',
  email: ''
};

export function FunnelBoard() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateFormState>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [stagesRes, studentsRes] = await Promise.all([
        fetch('/api/v1/funnel-stages', { cache: 'no-store' }),
        fetch('/api/v1/students', { cache: 'no-store' })
      ]);

      if (!stagesRes.ok || !studentsRes.ok) {
        throw new Error('Не удалось загрузить данные воронки');
      }

      const stagesData = (await stagesRes.json()) as FunnelStage[];
      const studentsData = (await studentsRes.json()) as Student[];

      setStages(stagesData);
      setStudents(studentsData);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const stage of stages) {
      map.set(stage.code, []);
    }

    for (const student of students) {
      const bucket = map.get(student.stage_code);
      if (bucket) bucket.push(student);
    }

    return map;
  }, [stages, students]);

  async function onCreate() {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: createForm.firstName,
          lastName: createForm.lastName,
          contactLink: createForm.contactLink || null,
          phone: createForm.phone || null,
          email: createForm.email || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Не удалось создать ученика');
      }

      setCreateForm(INITIAL_FORM);
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  }

  async function onStageChange(studentId: string, stageCode: string) {
    setError(null);

    const response = await fetch(`/api/v1/students/${studentId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageCode })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? 'Не удалось обновить этап');
      return;
    }

    await refresh();
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          Воронка
        </Typography.Title>
        <Typography.Text type="secondary">Канбан с этапами и карточками учеников.</Typography.Text>
      </div>

      <Card title="Добавить ученика">
        <Form layout="vertical" onFinish={onCreate}>
          <Row gutter={12}>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Имя" required>
                <Input
                  required
                  value={createForm.firstName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Фамилия" required>
                <Input
                  required
                  value={createForm.lastName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Телефон">
                <Input value={createForm.phone} onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Form.Item label="Email">
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={24} lg={10}>
              <Form.Item label="Ссылка для связи">
                <Input
                  value={createForm.contactLink}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, contactLink: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={24} lg={6}>
              <Form.Item label=" ">
                <Button type="primary" htmlType="submit" loading={creating} block>
                  Создать
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}

      {!loading ? (
        <Row gutter={[12, 12]}>
          {stages.map((stage) => {
            const stageStudents = grouped.get(stage.code) ?? [];

            return (
              <Col key={stage.id} xs={24} md={12} xl={8}>
                <Card title={stage.name} extra={<Typography.Text type="secondary">{stageStudents.length} учеников</Typography.Text>}>
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    {stageStudents.map((student) => (
                      <Card key={student.id} size="small" type="inner">
                        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                          <Typography.Text strong>
                            {student.first_name} {student.last_name}
                          </Typography.Text>
                          <Typography.Text type="secondary">{student.phone ?? 'Без телефона'}</Typography.Text>
                          <Typography.Text type="secondary">{student.email ?? 'Без email'}</Typography.Text>
                          <Select
                            value={student.stage_code}
                            onChange={(value) => void onStageChange(student.id, value)}
                            options={stages.map((option) => ({ value: option.code, label: option.name }))}
                          />
                        </Space>
                      </Card>
                    ))}

                    {stageStudents.length === 0 ? <Typography.Text type="secondary">Нет учеников</Typography.Text> : null}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : null}
    </Space>
  );
}
