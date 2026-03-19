'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppNav } from '@/components/nav';
import { Badge } from '@/components/ui';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from '@/components/ui/sidebar';
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
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="gap-1.5 p-4">
          <h1 className="text-2xl font-semibold group-data-[collapsible=icon]:hidden">GelbCRM</h1>
          <Badge variant="secondary" className="w-fit group-data-[collapsible=icon]:hidden">
            {session.role === 'admin' ? 'Администратор' : 'Преподаватель'}: {session.login}
          </Badge>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <AppNav role={session.role} pathname={pathname} />
          </SidebarGroup>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">Навигация</span>
        </header>
        <main className="mx-auto w-full max-w-[1280px] p-5">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
