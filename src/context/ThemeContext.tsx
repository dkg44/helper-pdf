/**
 * ThemeContext – local-only, no server dependency.
 * Theme is persisted via AsyncStorage on-device.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeType = 'light' | 'dark' | 'midnight' | 'forest';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryHover: string;
  bg: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  dim: string;
  border: string;
  inputBg: string;
  success: string;
  warning: string;
  danger: string;
}

export const THEMES: Record<ThemeType, ThemeColors> = {
  light: {
    primary: '#6366f1', primaryDark: '#4f46e5', primaryHover: '#4338ca',
    bg: '#f5f6ff', background: '#f5f6ff', card: '#ffffff',
    text: '#1a1b2e', muted: '#5c5f7a', dim: '#9395b0',
    border: '#e2e4f5', inputBg: '#f0f1fb',
    success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  },
  dark: {
    primary: '#8b5cf6', primaryDark: '#7c3aed', primaryHover: '#6d28d9',
    bg: '#09090b', background: '#09090b', card: '#18181b',
    text: '#f4f4f5', muted: '#a1a1aa', dim: '#71717a',
    border: 'rgba(255,255,255,0.1)', inputBg: 'rgba(255,255,255,0.05)',
    success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  },
  midnight: {
    primary: '#38bdf8', primaryDark: '#0ea5e9', primaryHover: '#0284c7',
    bg: '#020617', background: '#020617', card: '#0f172a',
    text: '#f8fafc', muted: '#94a3b8', dim: '#64748b',
    border: 'rgba(255,255,255,0.06)', inputBg: 'rgba(255,255,255,0.04)',
    success: '#22c55e', warning: '#f59e0b', danger: '#ef4444',
  },
  forest: {
    primary: '#10b981', primaryDark: '#059669', primaryHover: '#047857',
    bg: '#041f1e', background: '#041f1e', card: '#064e3b',
    text: '#ecfdf5', muted: '#a7f3d0', dim: '#6ee7b7',
    border: 'rgba(255,255,255,0.07)', inputBg: 'rgba(255,255,255,0.05)',
    success: '#22c55e', warning: '#fbbf24', danger: '#f87171',
  },
};

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  setThemeName: (name: ThemeType) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const STORAGE_KEY = '@helperPdf_theme';
const CYCLE: ThemeType[] = ['light', 'dark', 'midnight', 'forest'];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && CYCLE.includes(saved as ThemeType)) setTheme(saved as ThemeType);
    }).catch(() => {});
  }, []);

  const setThemeName = async (name: ThemeType) => {
    setTheme(name);
    try { await AsyncStorage.setItem(STORAGE_KEY, name); } catch {}
  };

  const toggleTheme = async () => {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    await setThemeName(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, colors: THEMES[theme], setThemeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
