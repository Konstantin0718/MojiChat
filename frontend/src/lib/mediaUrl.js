const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export function mediaUrl(path) {
  if (!path || typeof path !== 'string') return '';
  const pathOnly = path.split('?')[0];
  if (pathOnly.startsWith('/uploads') || pathOnly.includes('/uploads/')) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
