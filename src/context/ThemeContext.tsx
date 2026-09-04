import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  isNightTime: boolean;
  timeLabel: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'tradeflow_theme_mode_v1';

// Function to check if the current time of day is night (6 PM to 6 AM)
const checkIsNightTime = (): boolean => {
  const currentHour = new Date().getHours();
  // 18:00 (6 PM) to 06:00 (6 AM) is Nighttime
  return currentHour >= 18 || currentHour < 6;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'light'; // default light: most screens are styled light-first
  });

  const [isNightTime, setIsNightTime] = useState<boolean>(checkIsNightTime());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Keep time of day and system preferences synchronized
  useEffect(() => {
    const updateTimeState = () => {
      setIsNightTime(checkIsNightTime());
    };

    // Check every minute for smooth time-of-day transitions
    const interval = setInterval(updateTimeState, 60000);

    // Also listen to OS level prefers-color-scheme
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    return () => {
      clearInterval(interval);
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, []);

  // Determine active resolved theme
  const resolvedTheme: ResolvedTheme = (() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    // In 'auto' mode, prioritize time of day (or OS system preference as secondary trigger)
    return isNightTime || systemPrefersDark ? 'dark' : 'light';
  })();

  // Apply class and data attribute to document root
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'deep-ocean');
      body.classList.add('dark');
      body.setAttribute('data-theme', 'deep-ocean');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      body.classList.remove('dark');
      body.setAttribute('data-theme', 'light');
    }
  }, [resolvedTheme]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  const cycleTheme = () => {
    if (themeMode === 'auto') setThemeMode('light');
    else if (themeMode === 'light') setThemeMode('dark');
    else setThemeMode('auto');
  };

  const currentHour = new Date().getHours();
  const timeFormatted = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const timeLabel =
    themeMode === 'auto'
      ? `Auto (${isNightTime ? 'Night' : 'Day'} • ${timeFormatted})`
      : themeMode === 'dark'
      ? 'Deep Ocean'
      : 'Light Neutral';

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        setThemeMode,
        cycleTheme,
        isNightTime,
        timeLabel,
      }}
    >
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
