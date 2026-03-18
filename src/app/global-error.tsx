'use client';

import { useEffect } from 'react';
import { Alert, Button, Space } from 'antd';

export default function GlobalError({
  error
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error('Global error boundary caught error', error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
          <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 560 }}>
            <Alert
              type="error"
              showIcon
              message="Приложение временно недоступно"
              description="Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу."
            />
            <Button type="primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
          </Space>
        </div>
      </body>
    </html>
  );
}
