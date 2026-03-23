'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppNav } from '@/components/nav';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator
} from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/session';

export function AppShell({ children, session }: { children: React.ReactNode; session: SessionUser | null }) {
  const pathname = usePathname() ?? '';
  const isPublicPaymentPage = pathname.startsWith('/payment-links/');

  if (isPublicPaymentPage) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto w-full max-w-4xl p-5">{children}</main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-5">
          <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
            Войти
          </Link>
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar variant="floating">
        <SidebarHeader>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-xl font-semibold">GelbCRM</h1>
            <Badge variant="secondary">
              {session.role === 'admin' ? 'Администратор' : 'Преподаватель'}: {session.login}
            </Badge>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <AppNav role={session.role} pathname={pathname} />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="bg-background/70">
        <main className="mx-auto w-full max-w-7xl p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
