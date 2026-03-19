'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@/components/ui';

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
          <div className="w-full max-w-[560px] space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Не удалось загрузить приложение</AlertTitle>
              <AlertDescription>Произошла ошибка в браузере. Попробуйте обновить страницу.</AlertDescription>
            </Alert>
            <Button onClick={this.handleReload}>
              Обновить страницу
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
