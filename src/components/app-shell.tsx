'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, Space, Tag, Typography } from 'antd';
import { AppNav } from '@/components/nav';
import type { SessionUser } from '@/lib/session';

const { Sider, Content } = Layout;

export function AppShell({ children, session }: { children: React.ReactNode; session: SessionUser | null }) {
  const pathname = usePathname();
  const isPublicPaymentPage = pathname.startsWith('/payment-links/');

  if (isPublicPaymentPage) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ maxWidth: 960, width: '100%', margin: '0 auto', padding: 20 }}>{children}</Content>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ maxWidth: 1280, width: '100%', margin: '0 auto', padding: 20 }}>
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Link href="/login">Войти</Link>
            {children}
          </Space>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={260} theme="light" breakpoint="lg" collapsedWidth={0} style={{ borderRight: '1px solid #e5e7eb' }}>
        <div style={{ padding: 16 }}>
          <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                GelbCRM
              </Typography.Title>
              <Tag color="geekblue">{session.role === 'admin' ? 'Администратор' : 'Преподаватель'}: {session.login}</Tag>
            </Space>

            <AppNav role={session.role} pathname={pathname} mode="inline" />
          </Space>
        </div>
      </Sider>

      <Layout>
        <Content style={{ maxWidth: 1280, width: '100%', margin: '0 auto', padding: 20 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
