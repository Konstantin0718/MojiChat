import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { notificationService } from '../services/notifications';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  // Heartbeat to keep online status
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      api.heartbeat();
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        const userData = await api.getMe();
        setUser(userData);
        
        // Register for push notifications (non-blocking)
        try { await notificationService.registerForPushNotifications(); } catch (_) {}
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await AsyncStorage.removeItem('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setUser(response);
    
    // Register for push notifications (non-blocking)
    try { await notificationService.registerForPushNotifications(); } catch (_) {}
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await api.register(email, password, name);
    setUser(response);
    
    // Register for push notifications (non-blocking)
    try { await notificationService.registerForPushNotifications(); } catch (_) {}
  };

  const logout = async () => {
    await api.logoutApi();
    setUser(null);
    await notificationService.clearAllNotifications();
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
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
