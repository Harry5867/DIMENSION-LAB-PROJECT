import { resolveWelcomeTheme, type WelcomeTheme } from './welcomePreferences';

export const themePreferenceKey = 'dimension-lab:theme';
export type ThemeMode = WelcomeTheme;
export type ResolvedTheme = 'light' | 'dark';
const valid = (value: string | null): value is ThemeMode => value === 'light' || value === 'dark' || value === 'system';

/** Migrate the welcome choice before the older, formerly forced-light Model value. */
export function readThemeMode(storage: Pick<Storage, 'getItem'>): ThemeMode {
  try {
    for (const key of [themePreferenceKey, 'dimension-lab:welcome-theme', 'theme']) {
      const value = storage.getItem(key);
      if (valid(value)) return value;
    }
  } catch { /* An in-memory light preference also works with blocked storage. */ }
  return 'light';
}
export const resolveTheme = resolveWelcomeTheme;
