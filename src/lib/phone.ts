export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, '');
  if (!digits) return null;

  let normalized = digits;

  if (normalized.length === 10) {
    normalized = `7${normalized}`;
  } else if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  }

  if (!/^7\d{10}$/.test(normalized)) {
    throw new Error('INVALID_PHONE_FORMAT');
  }

  return `+${normalized}`;
}
