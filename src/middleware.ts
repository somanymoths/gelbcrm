import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const adminOnly = ['/funnel', '/teachers', '/payments'];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  const role = request.cookies.get('role')?.value ?? 'admin';

  if (adminOnly.some((prefix) => pathname.startsWith(prefix)) && role !== 'admin') {
    return NextResponse.redirect(new URL('/forbidden', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
