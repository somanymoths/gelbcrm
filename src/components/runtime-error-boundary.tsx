'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type RuntimeErrorBoundaryState = {
  hasError: boolean;
};

export class RuntimeErrorBoundary extends React.Component<React.PropsWithChildren, RuntimeErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): RuntimeErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('RuntimeErrorBoundary caught error', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center p-4">
          <div className="flex w-full max-w-xl flex-col gap-4">
            <Alert variant="destructive">
              <AlertTitle>Не удалось загрузить приложение</AlertTitle>
              <AlertDescription>Произошла ошибка в браузере. Попробуйте обновить страницу.</AlertDescription>
            </Alert>
            <Button className="w-fit" onClick={this.handleReload}>
              Обновить страницу
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
