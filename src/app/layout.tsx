import './globals.css';
import type { Metadata } from 'next';
import { AppNav } from '@/components/nav';
import { getCurrentRole } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'GELB CRM',
  description: 'CRM для языковой онлайн-школы'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();

  return (
    <html lang="ru">
      <body>
        <div className="container">
          <header className="panel" style={{ marginBottom: 16 }}>
            <h1 style={{ marginTop: 0 }}>GELB CRM</h1>
            <p style={{ marginTop: 0, color: '#475569' }}>Роль: {role === 'admin' ? 'Администратор' : 'Преподаватель'}</p>
            <AppNav role={role} />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
