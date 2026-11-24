export function resetLinkTarget(url: string | null): { token: string } | null {
  if (!url) return null;
  let path = '';
  let token = '';
  try {
    if (url.startsWith('mojichat://')) {
      const rest = url.slice('mojichat://'.length);
      const [pathPart, query = ''] = rest.split('?');
      path = pathPart.replace(/^\/+/, '').replace(/\/+$/, '');
      token = new URLSearchParams(query).get('token') || '';
    } else {
      const parsed = new URL(url);
      path = parsed.pathname.replace(/^\/+|\/+$/g, '');
      token = parsed.searchParams.get('token') || '';
    }
  } catch {
    return null;
  }
  if (path !== 'forgot-password' && path !== 'reset-password') return null;
  return { token };
}
