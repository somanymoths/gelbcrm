'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, CreditCard, GraduationCap, KanbanSquare } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const router = useRouter();
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  return (
    <nav className="flex flex-col gap-1">
      {allowed.map((item) => {
        const active = selectedKey === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              router.push(item.href);
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {ITEM_ICONS[item.href]}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
