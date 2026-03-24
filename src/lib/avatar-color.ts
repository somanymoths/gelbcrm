export function getStableAvatarSeed(input: {
  id?: string | null;
  firstName?: string | null;
  fallbackFullName?: string | null;
}): string {
  const firstName = input.firstName?.trim() ?? '';
  const fallbackName = input.fallbackFullName?.trim() ?? '';
  const base = [input.id?.trim() ?? '', firstName || fallbackName].filter(Boolean).join(':');
  return base || 'unknown';
}

export function getStableAvatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 68% 46%)`;
}

export function getStableAvatarInitial(input: {
  firstName?: string | null;
  fallbackFullName?: string | null;
}): string {
  const firstName = input.firstName?.trim() ?? '';
  const fallbackName = input.fallbackFullName?.trim() ?? '';
  const source = firstName || fallbackName || 'У';
  return source.charAt(0).toUpperCase();
}
