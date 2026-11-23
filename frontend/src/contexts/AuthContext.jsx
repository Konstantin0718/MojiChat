import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('mojichat_token'));

  const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

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
    } catch (error) {
      setUser(null);
      setToken(null);
      localStorage.removeItem('mojichat_token');
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

  const loginWithGoogleCredential = async (credential) => {
    const response = await api.post('/auth/google', { credential });
    const { token: newToken, ...userData } = response.data;
    setToken(newToken);
    localStorage.setItem('mojichat_token', newToken);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore logout errors
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
        token,
        login,
        register,
        logout,
        loginWithGoogleCredential,
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
