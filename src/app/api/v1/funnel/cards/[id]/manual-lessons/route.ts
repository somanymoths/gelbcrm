import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  await request.json().catch(() => null);
  await context.params;
  return NextResponse.json(
    { code: 'MANUAL_LESSONS_DISABLED', message: 'Ручное добавление занятий отключено' },
    { status: 403 }
  );
}
