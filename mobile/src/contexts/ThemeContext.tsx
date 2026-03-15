import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../config';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  colors: typeof COLORS.light;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('system');
  const [isLoading, setIsLoading] = useState(true);
  const themeRef = useRef<Theme>(theme);

  // Keep ref in sync
  themeRef.current = theme;

  // Load saved theme once on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('theme');
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
          setThemeState(saved as Theme);
        }
      } catch (_) {}
      setIsLoading(false);
    })();
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    if (newTheme === themeRef.current) return;
    setThemeState(newTheme);
    try { await AsyncStorage.setItem('theme', newTheme); } catch (_) {}
  }, []);

  const toggleTheme = useCallback(() => {
    const next = themeRef.current === 'dark' || (themeRef.current === 'system' && systemColorScheme === 'dark') ? 'light' : 'dark';
    setTheme(next);
  }, [systemColorScheme, setTheme]);

  const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
  const colors = isDark ? COLORS.dark : COLORS.light;

  const value = useMemo(() => ({
    theme, isDark, colors, setTheme, toggleTheme, isLoading
  }), [theme, isDark, colors, setTheme, toggleTheme, isLoading]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
