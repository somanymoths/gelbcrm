import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/env';
import { verifySessionToken, type SessionUser } from '@/lib/session';
import { getActiveUserSessionMetaById } from '@/lib/db';

export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const meta = await getActiveUserSessionMetaById(session.id);
  if (!meta) return null;
  if (meta.session_version !== session.sessionVersion) return null;

  return session;
}

export async function getCurrentRole() {
  const session = await getCurrentSession();
  return session?.role ?? null;
}
