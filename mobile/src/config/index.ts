import Constants from 'expo-constants';

/** Voice and video calls stay off unless app.json extra.callsEnabled is true. */
export const CALLS_ENABLED = Constants.expoConfig?.extra?.callsEnabled === true;

// API Configuration
// Replace with your actual backend URL
export const API_URL = 'https://mojichat.onrender.com';

export const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

const ALLOWED_MEDIA_HOSTS = /^media\d*\.giphy\.com$|^i\.giphy\.com$/;

export function mediaUrl(path?: string | null): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  const pathOnly = trimmed.split('?')[0];
  if (pathOnly.startsWith('/uploads') || pathOnly.includes('/uploads/')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!/^https:\/\//i.test(trimmed)) return '';
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || !ALLOWED_MEDIA_HOSTS.test(url.hostname || '')) return '';
      return url.href;
    } catch {
      return '';
    }
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('\\')) return '';
  return `${API_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function profileUrl(path?: string | null): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch {
      return '';
    }
  }
  return mediaUrl(trimmed);
}

type IceServer = { urls: string; username?: string; credential?: string };

function buildIceServers(): IceServer[] {
  const servers: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];
  // Optional TURN server. Set EXPO_PUBLIC_TURN_URL plus username and
  // credential when the server requires them. Nothing is hardcoded.
  const turnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  if (turnUrl) {
    const turnServer: IceServer = { urls: turnUrl };
    if (process.env.EXPO_PUBLIC_TURN_USERNAME) {
      turnServer.username = process.env.EXPO_PUBLIC_TURN_USERNAME;
    }
    if (process.env.EXPO_PUBLIC_TURN_CREDENTIAL) {
      turnServer.credential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;
    }
    servers.push(turnServer);
  }
  return servers;
}

// WebRTC Configuration
export const WEBRTC_CONFIG = {
  iceServers: buildIceServers(),
};

// App Configuration
export const APP_CONFIG = {
  name: 'MojiChat',
  version: '2.3.7',
  defaultLanguage: 'en',
  supportedLanguages: {
    en: 'English',
    bg: 'Bulgarian',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    it: 'Italian',
    ru: 'Russian',
    tr: 'Turkish',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    uk: 'Ukrainian',
  },
};

// Theme colors
export const COLORS = {
  light: {
    primary: '#8B5CF6',
    secondary: '#EC4899',
    accent: '#06B6D4',
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  dark: {
    primary: '#8B5CF6',
    secondary: '#EC4899',
    accent: '#06B6D4',
    background: '#09090B',
    card: '#18181B',
    text: '#FAFAFA',
    textSecondary: '#A1A1AA',
    border: '#27272A',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
};
