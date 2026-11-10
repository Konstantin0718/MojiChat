// API Configuration
// Replace with your actual backend URL
export const API_URL = 'https://mojichat.onrender.com';

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
  version: '2.3.1',
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
