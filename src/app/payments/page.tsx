'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { PaymentsHistoryTab } from '@/components/payments/history-tab';
import { TariffsTab } from '@/components/payments/tariffs-tab';

const TABS = {
  tariffs: 'tariffs',
  history: 'history'
} as const;

export default function PaymentsPage() {
  const router = useRouter();
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
      <h1 className="mt-0">Оплаты</h1>
      <p className="text-muted-foreground">Управление тарифами и история платежей.</p>
      <Tabs
        defaultValue={defaultTab}
        onValueChange={(value) => {
          const next = value === TABS.history ? TABS.history : TABS.tariffs;
          router.replace(`/payments?tab=${next}`);
        }}
      >
        <TabsList>
          <TabsTrigger value={TABS.tariffs}>Тарифы</TabsTrigger>
          <TabsTrigger value={TABS.history}>История оплат</TabsTrigger>
        </TabsList>
        <TabsContent value={TABS.tariffs}>
          <TariffsTab />
        </TabsContent>
        <TabsContent value={TABS.history}>
          <PaymentsHistoryTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
