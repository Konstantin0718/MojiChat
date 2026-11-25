import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { firebaseWebConfig } from '../lib/firebaseWebConfig.mjs';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem('mojichat_token'));
  const apiRef = useRef(null);
  if (!apiRef.current) {
    const instance = axios.create({
      baseURL: `${API_URL}/api`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const url = String(error?.config?.url || '');
        if (status === 401 && !url.includes('/auth/login')) {
          setUser(null);
          setToken(null);
          setOffline(false);
          localStorage.removeItem('mojichat_token');
          delete instance.defaults.headers.Authorization;
        }
        return Promise.reject(error);
      }
    );
    apiRef.current = instance;
  }
  const api = apiRef.current;

  // Update axios headers when token changes
  useEffect(() => {
    if (token) {
      api.defaults.headers.Authorization = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.Authorization;
    }
  }, [token]);

  const checkAuth = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      setOffline(false);
    } catch (error) {
      if (error?.response?.status === 401) {
        setUser(null);
        setToken(null);
        setOffline(false);
        localStorage.removeItem('mojichat_token');
      } else if (localStorage.getItem('mojichat_token')) {
        setOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Heartbeat to update online status
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        await api.post('/users/heartbeat');
      } catch (e) {
        // Ignore heartbeat errors
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token: newToken, ...userData } = response.data;
    setToken(newToken);
    localStorage.setItem('mojichat_token', newToken);
    setUser(userData);
    return userData;
  };

  const register = async (email, password, name) => {
    const response = await api.post('/auth/register', { email, password, name });
    const { token: newToken, ...userData } = response.data;
    setToken(newToken);
    localStorage.setItem('mojichat_token', newToken);
    setUser(userData);
    return userData;
  };

  const googleSignInReady = Boolean(firebaseWebConfig());
  const googleAuthRef = useRef(null);

  useEffect(() => {
    if (!googleSignInReady) return undefined;
    let cancelled = false;
    (async () => {
      const config = firebaseWebConfig();
      if (!config) return;
      const appMod = await import('firebase/app');
      const authMod = await import('firebase/auth');
      if (cancelled) return;
      const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(config);
      googleAuthRef.current = { auth: authMod.getAuth(app), authMod };
    })();
    return () => {
      cancelled = true;
    };
  }, [googleSignInReady]);

  const loginWithGoogle = async () => {
    const loaded = googleAuthRef.current;
    if (!loaded) {
      throw new Error('Google sign-in is loading, try again');
    }
    const provider = new loaded.authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await loaded.authMod.signInWithPopup(loaded.auth, provider);
    const idToken = await result.user.getIdToken();
    const response = await api.post('/auth/firebase', { id_token: idToken });
    const { token: newToken, ...userData } = response.data;
    setToken(newToken);
    localStorage.setItem('mojichat_token', newToken);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    let endpoint = null;
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (subscription) {
          endpoint = subscription.endpoint;
          try {
            await api.delete('/notifications/unsubscribe', { data: { endpoint } });
          } catch (e) {
            // Logout still removes the endpoint below.
          }
          try {
            await subscription.unsubscribe();
          } catch (e) {
            // The browser subscription can already be gone.
          }
        }
      }
    } catch (e) {
      // A missing service worker must not block logout.
    }
    try {
      await api.post('/auth/logout', endpoint ? { endpoint } : {});
    } catch (e) {
      // Ignore logout errors
    }
    const loaded = googleAuthRef.current;
    if (loaded?.auth) {
      try {
        await loaded.authMod.signOut(loaded.auth);
      } catch (e) {
        // Local logout still finishes when Firebase is unreachable.
      }
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('mojichat_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        offline,
        retryAuth: checkAuth,
        token,
        login,
        register,
        logout,
        loginWithGoogle,
        googleSignInReady,
        api,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
