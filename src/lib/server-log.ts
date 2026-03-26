type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = {
  level: LogLevel;
  event: string;
  timestamp: string;
  requestId?: string | null;
  route?: string;
  details?: Record<string, unknown>;
  error?: {
    name?: string;
    message?: string;
    code?: string;
    stack?: string;
  };
};

function toErrorShape(error: unknown): LogPayload['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown; code?: unknown; stack?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      stack: typeof candidate.stack === 'string' ? candidate.stack : undefined
    };
  }

  return {
    message: String(error)
  };
}

function emit(payload: LogPayload): void {
  const line = JSON.stringify(payload);
  if (payload.level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

export function getRequestIdFromRequest(request: Request): string | null {
  return request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id');
}

export function logServerEvent(params: {
  level: LogLevel;
  event: string;
  requestId?: string | null;
  route?: string;
  details?: Record<string, unknown>;
  error?: unknown;
}): void {
  emit({
    level: params.level,
    event: params.event,
    timestamp: new Date().toISOString(),
    requestId: params.requestId ?? null,
    route: params.route,
    details: params.details,
    error: params.error !== undefined ? toErrorShape(params.error) : undefined
  });
}
