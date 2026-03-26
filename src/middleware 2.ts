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

  if (isPublicPath(pathname)) {
    if (pathname === '/login') {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token) {
        const session = await verifySessionToken(token);
        if (session) {
          return redirectTo(request, session.role === 'admin' ? '/funnel' : '/journal');
        }
      }
    }
    return NextResponse.next();
  }

  if (!allProtected.some((prefix) => pathname.startsWith(prefix)) && pathname !== '/') {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return redirectTo(request, '/login');
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return redirectTo(request, '/login');
  }

  if (adminOnly.some((prefix) => pathname.startsWith(prefix)) && session.role !== 'admin') {
    return redirectTo(request, '/forbidden');
  }

  return NextResponse.next();
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
