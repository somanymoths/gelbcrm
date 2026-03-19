'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@/components/ui';

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
    <div className="grid min-h-[60vh] place-items-center p-4">
      <div className="w-full max-w-[560px] space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Не удалось открыть страницу</AlertTitle>
          <AlertDescription>Возникла ошибка при загрузке. Нажмите кнопку ниже, чтобы повторить попытку.</AlertDescription>
        </Alert>
        <Button onClick={reset}>
          Повторить
        </Button>
      </div>
    </div>
  );
}
