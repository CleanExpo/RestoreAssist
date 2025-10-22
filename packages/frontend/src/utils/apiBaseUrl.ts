const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

function ensureApiPath(pathname: string): string {
  const trimmed = pathname.trim();

  if (!trimmed) {
    return '/api';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');

  if (!withoutTrailingSlash || withoutTrailingSlash === '/') {
    return '/api';
  }

  const withLeadingSlash = withoutTrailingSlash.startsWith('/')
    ? withoutTrailingSlash
    : `/${withoutTrailingSlash}`;

  if (/\/api(\/|$)/.test(withLeadingSlash)) {
    return withLeadingSlash;
  }

  if (withLeadingSlash === '/') {
    return '/api';
  }

  return `${withLeadingSlash}/api`;
}

function normalizeAbsoluteUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.pathname = ensureApiPath(url.pathname || '/');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim();

  if (!raw) {
    return DEFAULT_API_BASE_URL;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const normalized = normalizeAbsoluteUrl(raw);
    if (normalized) {
      return normalized;
    }
  }

  const relative = ensureApiPath(raw).replace(/\/+$/, '');
  return relative || DEFAULT_API_BASE_URL;
}

