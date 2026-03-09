import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/env';
import { verifySessionToken, type SessionUser } from '@/lib/session';

export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getCurrentRole() {
  const session = await getCurrentSession();
  return session?.role ?? null;
}
