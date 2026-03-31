'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookType, CalendarDays, Funnel, LogOut, Wallet, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

export function AppNav({ role, pathname }: { role: AppRole; pathname: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const itemIconByHref: Record<string, LucideIcon> = {
    '/funnel': Funnel,
    '/teachers': BookType,
    '/payments': Wallet,
    '/journal': CalendarDays
  };

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu aria-label="Основная навигация">
            {allowed.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={selectedKey === item.href}
                  className="data-[active=true]:bg-foreground data-[active=true]:text-white data-[active=true]:font-normal data-[active=true]:hover:bg-foreground data-[active=true]:hover:text-white"
                >
                  <Link href={item.href}>
                    {(() => {
                      const Icon = itemIconByHref[item.href];
                      return Icon ? <Icon /> : null;
                    })()}
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarFooter className="mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void handleLogout()} disabled={loggingOut}>
              <LogOut />
              <span>{loggingOut ? 'Выход...' : 'Выход'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
