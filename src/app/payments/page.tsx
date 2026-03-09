'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs } from 'antd';
import { PaymentsHistoryTab } from '@/components/payments/history-tab';
import { TariffsTab } from '@/components/payments/tariffs-tab';

const TABS = {
  tariffs: 'tariffs',
  history: 'history'
} as const;

export default function PaymentsPage() {
  const searchParams = useSearchParams();

  const defaultTab = useMemo(() => {
    const tab = searchParams.get('tab');

    if (tab === TABS.history) {
      return TABS.history;
    }

    return TABS.tariffs;
  }, [searchParams]);

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Оплаты</h1>
      <p style={{ color: 'rgba(0, 0, 0, 0.45)' }}>Управление тарифами и история платежей.</p>
      <Tabs
        defaultActiveKey={defaultTab}
        items={[
          {
            key: TABS.tariffs,
            label: 'Тарифы',
            children: <TariffsTab />
          },
          {
            key: TABS.history,
            label: 'История оплат',
            children: <PaymentsHistoryTab />
          }
        ]}
      />
    </>
  );
}
