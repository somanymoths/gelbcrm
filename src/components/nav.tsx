'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

export function AppNav({
  role,
  pathname,
  mode = 'inline'
}: {
  role: AppRole;
  pathname: string;
  mode?: 'inline' | 'horizontal';
}) {
  const router = useRouter();
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  return (
    <nav
      className={cn('flex gap-2', mode === 'horizontal' ? 'flex-row flex-wrap items-center' : 'flex-col items-stretch')}
      aria-label="Основная навигация"
    >
      {allowed.map((item) => {
        const isActive = selectedKey === item.href;
        return (
          <Button
            key={item.href}
            type="button"
            variant={isActive ? 'default' : 'ghost'}
            className={cn('justify-start', mode === 'inline' ? 'w-full' : '')}
            onClick={() => router.push(item.href)}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
