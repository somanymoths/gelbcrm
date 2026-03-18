'use client';

import { useEffect } from 'react';
import { Alert, Button, Space } from 'antd';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error boundary caught error', error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 560 }}>
        <Alert
          type="error"
          showIcon
          message="Не удалось открыть страницу"
          description="Возникла ошибка при загрузке. Нажмите кнопку ниже, чтобы повторить попытку."
        />
        <Button type="primary" onClick={reset}>
          Повторить
        </Button>
      </Space>
    </div>
  );
}
