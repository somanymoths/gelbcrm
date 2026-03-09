import { SignJWT, jwtVerify } from 'jose';
import type { AppRole } from '@/lib/types';
import { getSessionSecret, SESSION_MAX_AGE_SECONDS } from '@/lib/env';

export type SessionUser = {
  id: string;
  role: AppRole;
  login: string;
};

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role, login: user.login })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256']
    });

    const role = payload.role;
    const login = payload.login;
    const userId = payload.sub;

    if (typeof userId !== 'string') return null;
    if (role !== 'admin' && role !== 'teacher') return null;
    if (typeof login !== 'string') return null;

    return { id: userId, role, login };
  } catch {
    return null;
  }
}
