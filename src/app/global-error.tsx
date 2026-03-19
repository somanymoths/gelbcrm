'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@/components/ui';

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
      <body className="m-0">
        <div className="grid min-h-screen place-items-center p-4">
          <div className="w-full max-w-[560px] space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Приложение временно недоступно</AlertTitle>
              <AlertDescription>Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.</AlertDescription>
            </Alert>
            <Button onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
