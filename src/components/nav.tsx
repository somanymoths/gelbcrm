import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

export function AppNav({ role }: { role: AppRole }) {
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {allowed.map((item) => (
        <Link key={item.href} href={item.href} style={{ textDecoration: 'none', color: '#0f172a' }}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
