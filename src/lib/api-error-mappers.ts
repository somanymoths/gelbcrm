import { NextResponse } from 'next/server';
import { getRequestIdFromRequest, logServerEvent } from '@/lib/server-log';

type InfraErrorMapOptions = {
  misconfiguredMessage: string;
  dbUnreachableMessage: string;
  dbAuthFailedMessage: string;
  dbUnreachableStatus?: number;
  dbAuthFailedStatus?: number;
  request?: Request;
  route?: string;
};

export function mapInfraError(error: unknown, options: InfraErrorMapOptions): NextResponse | null {
  const message = error instanceof Error ? error.message : '';
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const requestId = options.request ? getRequestIdFromRequest(options.request) : null;

  if (message.startsWith('Missing required env var:')) {
    logServerEvent({
      level: 'error',
      event: 'infra.server_misconfigured',
      requestId,
      route: options.route,
      error
    });
    return NextResponse.json({ code: 'SERVER_MISCONFIGURED', message: options.misconfiguredMessage }, { status: 500 });
  }

  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    logServerEvent({
      level: 'error',
      event: 'infra.db_unreachable',
      requestId,
      route: options.route,
      error
    });
    return NextResponse.json(
      { code: 'DB_UNREACHABLE', message: options.dbUnreachableMessage },
      { status: options.dbUnreachableStatus ?? 503 }
    );
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    logServerEvent({
      level: 'error',
      event: 'infra.db_auth_failed',
      requestId,
      route: options.route,
      error
    });
    return NextResponse.json(
      { code: 'DB_AUTH_FAILED', message: options.dbAuthFailedMessage },
      { status: options.dbAuthFailedStatus ?? 503 }
    );
  }

  return null;
}
