'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

export function AppNav({ role, pathname }: { role: AppRole; pathname: string }) {
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Навигация</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Основная навигация">
          {allowed.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={selectedKey === item.href}>
                <Link href={item.href}>{item.label}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
