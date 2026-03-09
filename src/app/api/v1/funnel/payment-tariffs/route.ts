import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { listPaymentTariffs } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const items = await listPaymentTariffs();
  return NextResponse.json(items);
}
