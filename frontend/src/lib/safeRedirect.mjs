const PENDING_REDIRECT_KEY = 'mojichat_redirect';

function isSafePath(value) {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return false;
  if (value.includes('\\') || value.includes('://')) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  return true;
}

export function safeRedirect(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!isSafePath(trimmed)) return null;
  try {
    const decoded = decodeURIComponent(trimmed);
    if (!isSafePath(decoded)) return null;
  } catch (e) {
    return null;
  }
  return trimmed;
}

export function rememberRedirect(value) {
  const safe = safeRedirect(value);
  if (safe && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PENDING_REDIRECT_KEY, safe);
  }
  return safe;
}

export function peekRedirect() {
  if (typeof sessionStorage === 'undefined') return null;
  return safeRedirect(sessionStorage.getItem(PENDING_REDIRECT_KEY));
}

export function consumeRedirect(fallback = '/chat') {
  const stored = peekRedirect();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  }
  return stored || fallback;
}
