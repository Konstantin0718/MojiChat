/** Voice and video calls stay off until CALLS_ENABLED is exactly "true". */
export function callsEnabled(raw = process.env.REACT_APP_CALLS_ENABLED) {
  return String(raw || '').trim().toLowerCase() === 'true';
}

export const CALLS_ENABLED = callsEnabled();
