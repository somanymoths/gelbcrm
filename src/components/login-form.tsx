'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Form, Input } from 'antd';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(values: { login: string; password: string }) {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Ошибка входа');
      }

      const meResponse = await fetch('/api/v1/auth/me');
      if (!meResponse.ok) {
        throw new Error('Не удалось определить роль пользователя');
      }

      const me = (await meResponse.json()) as { role: 'admin' | 'teacher' };

      router.replace(me.role === 'admin' ? '/funnel' : '/journal');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form layout="vertical" onFinish={onSubmit}>
      <Form.Item label="Логин" name="login" rules={[{ required: true, message: 'Введите логин' }]}>
        <Input autoComplete="username" size="large" />
      </Form.Item>

      <Form.Item label="Пароль" name="password" rules={[{ required: true, message: 'Введите пароль' }]}>
        <Input.Password autoComplete="current-password" size="large" />
      </Form.Item>

      {error ? (
        <Form.Item>
          <Alert type="error" message={error} showIcon />
        </Form.Item>
      ) : null}

      <Button type="primary" htmlType="submit" loading={loading} size="large" block>
        Войти
      </Button>
    </Form>
  );
}
