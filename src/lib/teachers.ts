export function normalizeTeacherPhone(input?: string | null): string | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;

  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return null;

  let localDigits = digitsOnly;
  if (localDigits.startsWith('7') || localDigits.startsWith('8')) {
    localDigits = localDigits.slice(1);
  }

  if (!/^\d{10}$/.test(localDigits)) {
    throw new Error('INVALID_PHONE_FORMAT');
  }

  return `+7 (${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6, 8)}-${localDigits.slice(8, 10)}`;
}

export function normalizeTelegramRaw(input?: string | null): string | null {
  if (!input) return null;
  const value = input.trim();
  return value || null;
}

export function deriveTelegramNormalized(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  let candidate = value;

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (host === 't.me' || host === 'www.t.me') {
        candidate = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
      }
    } catch {
      return null;
    }
  }

  if (candidate.startsWith('@')) {
    candidate = candidate.slice(1);
  }

  candidate = candidate.trim();
  if (!candidate) return null;

  const sanitized = candidate.replace(/[^A-Za-z0-9_]/g, '');
  if (!sanitized) return null;

  return sanitized.toLowerCase();
}

export function formatTelegramDisplay(raw?: string | null): string | null {
  const normalized = deriveTelegramNormalized(raw);
  return normalized ? `@${normalized}` : null;
}
