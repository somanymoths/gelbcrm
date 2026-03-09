'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { BankOutlined, BookOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { NAV_ITEMS } from '@/lib/types';
import type { AppRole } from '@/lib/types';

const ITEM_ICONS: Record<string, React.ReactNode> = {
  '/funnel': <UserSwitchOutlined />,
  '/teachers': <TeamOutlined />,
  '/payments': <BankOutlined />,
  '/journal': <BookOutlined />
};

export function AppNav({
  role,
  pathname,
  mode = 'inline'
}: {
  role: AppRole;
  pathname: string;
  mode?: MenuProps['mode'];
}) {
  const router = useRouter();
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const selectedKey = useMemo(() => {
    const match = allowed.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? '';
  }, [allowed, pathname]);

  return (
    <Menu
      mode={mode}
      selectedKeys={selectedKey ? [selectedKey] : []}
      onClick={({ key }) => router.push(String(key))}
      items={allowed.map((item) => ({
        key: item.href,
        icon: ITEM_ICONS[item.href],
        label: item.label
      }))}
    />
  );
}
