'use client';

import React from 'react';
import { Alert, Button, Space } from 'antd';

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
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
          <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 560 }}>
            <Alert
              type="error"
              showIcon
              message="Не удалось загрузить приложение"
              description="Произошла ошибка в браузере. Попробуйте обновить страницу."
            />
            <Button type="primary" onClick={this.handleReload}>
              Обновить страницу
            </Button>
          </Space>
        </div>
      );
    }

    return this.props.children;
  }
}
