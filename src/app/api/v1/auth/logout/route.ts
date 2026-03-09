import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/env';

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
  return response;
}
