'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
      <div className="flex w-full max-w-xl flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>Не удалось открыть страницу</AlertTitle>
          <AlertDescription>Возникла ошибка при загрузке. Нажмите кнопку ниже, чтобы повторить попытку.</AlertDescription>
        </Alert>
        <Button className="w-fit" onClick={reset}>
          Повторить
        </Button>
      </div>
    </div>
  );
}
