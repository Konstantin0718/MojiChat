export const GOOGLE_PASSWORD_ACCOUNT_MESSAGE = 'This email has a password account. Sign in with your password or reset it via Forgot password, then you can also use Google.';

export function googleSignInErrorText(error) {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return '';
  }
  if (error?.message === 'Google sign-in is loading, try again') {
    return error.message;
  }
  const detail = error?.response?.data?.detail;
  if (detail === 'password_account') {
    return GOOGLE_PASSWORD_ACCOUNT_MESSAGE;
  }
  if (typeof detail === 'string' && detail) {
    return detail;
  }
  return 'Google sign-in failed';
}

/** Public Firebase web config. Missing keys hide Google sign-in instead of crashing. */
export function firebaseWebConfig(env = process.env) {
  const config = {
    apiKey: String(env.REACT_APP_FIREBASE_API_KEY || '').trim(),
    authDomain: String(env.REACT_APP_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(env.REACT_APP_FIREBASE_PROJECT_ID || '').trim(),
    appId: String(env.REACT_APP_FIREBASE_APP_ID || '').trim(),
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    return null;
  }
  const messagingSenderId = String(env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  if (messagingSenderId) {
    config.messagingSenderId = messagingSenderId;
  }
  return config;
}
