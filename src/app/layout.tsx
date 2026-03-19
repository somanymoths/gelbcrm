import './globals.css';
import type { Metadata } from 'next';
import { getCurrentSession } from '@/lib/auth';
import { AppProviders } from '@/components/app-providers';
import { AppShell } from '@/components/app-shell';
import { RuntimeErrorBoundary } from '@/components/runtime-error-boundary';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'GelbCRM',
  applicationName: 'GelbCRM',
  description: 'CRM для языковой онлайн-школы'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();

  return (
    <html lang="ru" className={cn("font-sans", inter.variable)}>
      <body>
        <AppProviders>
          <RuntimeErrorBoundary>
            <AppShell session={session}>{children}</AppShell>
          </RuntimeErrorBoundary>
        </AppProviders>
      </body>
    </html>
  );
}
