import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/constants';
import { verifySessionToken } from '@/lib/session';

const adminOnly = ['/funnel', '/teachers', '/payments'];
const allProtected = ['/funnel', '/teachers', '/payments', '/journal'];

function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/favicon.ico';
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestId = request.headers.get('x-request-id') ?? createRequestId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  if (isPublicPath(pathname)) {
    if (pathname === '/login') {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token) {
        const session = await verifySessionToken(token);
        if (session) {
          return withRequestId(redirectTo(request, session.role === 'admin' ? '/funnel' : '/journal'), requestId);
        }
      }
    }
    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
  }

  if (!allProtected.some((prefix) => pathname.startsWith(prefix)) && pathname !== '/') {
    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return withRequestId(redirectTo(request, '/login'), requestId);
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return withRequestId(redirectTo(request, '/login'), requestId);
  }

  if (adminOnly.some((prefix) => pathname.startsWith(prefix)) && session.role !== 'admin') {
    return withRequestId(redirectTo(request, '/forbidden'), requestId);
  }

  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');

  if (forwardedProto) {
    url.protocol = forwardedProto;
  }

  if (forwardedHost) {
    url.host = forwardedHost;
  }

  url.pathname = path;
  url.search = '';
  return NextResponse.redirect(url);
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId);
  return response;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
