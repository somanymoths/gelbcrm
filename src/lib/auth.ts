import { cookies } from 'next/headers';
import type { AppRole } from '@/lib/types';

export async function getCurrentRole(): Promise<AppRole> {
  const cookieStore = await cookies();
  const role = cookieStore.get('role')?.value;
  if (role === 'teacher') return 'teacher';
  return 'admin';
}
