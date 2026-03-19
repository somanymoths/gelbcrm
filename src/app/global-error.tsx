'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
          <div className="flex w-full max-w-xl flex-col gap-4">
            <Alert variant="destructive">
              <AlertTitle>Приложение временно недоступно</AlertTitle>
              <AlertDescription>Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.</AlertDescription>
            </Alert>
            <Button className="w-fit" onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
