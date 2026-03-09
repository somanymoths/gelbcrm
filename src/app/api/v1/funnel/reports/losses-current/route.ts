import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getLossesCurrentReport } from '@/lib/funnel';

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const data = await getLossesCurrentReport();
  return NextResponse.json(data);
}
