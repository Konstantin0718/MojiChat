function backendOrigin() {
  return process.env.REACT_APP_BACKEND_URL || '';
}

export function mediaUrl(path) {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  const pathOnly = trimmed.split('?')[0];
  if (pathOnly.startsWith('/uploads') || pathOnly.includes('/uploads/')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) return '';
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch (e) {
      return '';
    }
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('\\')) return '';
  const origin = backendOrigin();
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

export function openMediaUrl(url) {
  const src = mediaUrl(url);
  if (!src || typeof window === 'undefined' || typeof window.open !== 'function') return;
  const opened = window.open(src, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
}
