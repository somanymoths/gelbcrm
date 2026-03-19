'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppNav } from '@/components/nav';
import { Badge } from '@/components/ui';
import type { SessionUser } from '@/lib/session';

export function AppShell({ children, session }: { children: React.ReactNode; session: SessionUser | null }) {
  const pathname = usePathname() ?? '';
  const isPublicPaymentPage = pathname.startsWith('/payment-links/');

  if (isPublicPaymentPage) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto w-full max-w-[960px] p-5">{children}</main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 p-5">
          <Link href="/login" className="text-sm underline">
            Войти
          </Link>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 h-screen overflow-y-auto border-r bg-card p-4">
        <div className="flex w-full flex-col gap-4">
          <div className="flex w-full flex-col gap-1.5">
            <h1 className="text-2xl font-semibold">GelbCRM</h1>
            <Badge variant="secondary" className="w-fit">
              {session.role === 'admin' ? 'Администратор' : 'Преподаватель'}: {session.login}
            </Badge>
          </div>

          <AppNav role={session.role} pathname={pathname} />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[1280px] p-5">{children}</main>
    </div>
  );
}
