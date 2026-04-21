export type AppRole = 'admin' | 'teacher';

export const NAV_ITEMS = [
  { href: '/funnel', label: 'Воронка', roles: ['admin'] as AppRole[] },
  { href: '/lenta', label: 'Лента', roles: ['admin'] as AppRole[] },
  { href: '/teachers', label: 'Преподаватели', roles: ['admin'] as AppRole[] },
  { href: '/payments', label: 'Оплаты', roles: ['admin'] as AppRole[] },
  { href: '/journal', label: 'Журнал', roles: ['admin', 'teacher'] as AppRole[] },
  { href: '/instructions', label: 'Инструкции', roles: ['admin', 'teacher'] as AppRole[] }
];
