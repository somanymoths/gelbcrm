'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, CreditCard, GraduationCap, KanbanSquare } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

const ITEM_ICONS: Record<string, React.ReactNode> = {
  '/funnel': <KanbanSquare className="h-4 w-4" />,
  '/teachers': <GraduationCap className="h-4 w-4" />,
  '/payments': <CreditCard className="h-4 w-4" />,
  '/journal': <BookOpen className="h-4 w-4" />
};

export function AppNav({
  role,
  pathname
}: {
  role: AppRole;
  pathname: string;
}) {
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  return (
    <SidebarMenu>
      {allowed.map((item) => {
        const active = selectedKey === item.href;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link href={item.href}>
                {ITEM_ICONS[item.href]}
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
