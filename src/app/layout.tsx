import './globals.css';
import 'antd/dist/reset.css';
import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { getCurrentSession } from '@/lib/auth';
import { AppProviders } from '@/components/app-providers';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'GelbCRM',
  applicationName: 'GelbCRM',
  description: 'CRM для языковой онлайн-школы'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();

  return (
    <html lang="ru">
      <head>
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
      </head>
      <body>
        <AntdRegistry>
          <AppProviders>
            <AppShell session={session}>{children}</AppShell>
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
