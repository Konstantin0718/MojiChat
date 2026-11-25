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
