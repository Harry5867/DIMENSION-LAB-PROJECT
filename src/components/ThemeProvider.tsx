import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { readThemeMode, resolveTheme, themePreferenceKey, type ThemeMode, type ResolvedTheme } from '../utils/themePreferences';

interface ThemeContextValue { theme: ResolvedTheme; mode: ThemeMode; setMode: (mode: ThemeMode) => void; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextValue | null>(null);
const loadMode = (): ThemeMode => { try { return readThemeMode(window.localStorage); } catch { return 'light'; } };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(loadMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = resolveTheme(mode, systemDark);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(query.matches);
    query.addEventListener('change', sync);
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === themePreferenceKey) setMode(loadMode()); };
    window.addEventListener('storage', storage);
    return () => { query.removeEventListener('change', sync); window.removeEventListener('storage', storage); };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');
  }, [theme]);
  useEffect(() => { try { localStorage.setItem(themePreferenceKey, mode); } catch { /* Keep the current session preference. */ } }, [mode]);
  const toggleTheme = useCallback(() => setMode(theme === 'dark' ? 'light' : 'dark'), [theme]);
  const value = useMemo(() => ({ theme, mode, setMode, toggleTheme }), [theme, mode, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is required.');
  return value;
}
