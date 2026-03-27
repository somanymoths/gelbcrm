'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookType, CalendarDays, Funnel, Wallet, type LucideIcon } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

export function AppNav({ role, pathname }: { role: AppRole; pathname: string }) {
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

  return (
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
  );
}
