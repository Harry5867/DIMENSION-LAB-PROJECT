export type WelcomeTheme = 'system' | 'light' | 'dark';
export type WelcomeLanguage = 'en' | 'vi';
export const welcomePreferenceKeys = { theme: 'dimension-lab:welcome-theme', language: 'dimension-lab:welcome-language' };

export function parseWelcomePreferences(theme: string | null, language: string | null) {
  return {
    theme: (theme === 'system' || theme === 'dark' ? theme : 'light') as WelcomeTheme,
    language: (language === 'vi' ? 'vi' : 'en') as WelcomeLanguage,
  };
}
export function resolveWelcomeTheme(theme: WelcomeTheme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? systemDark ? 'dark' : 'light' : theme;
}

export function loadWelcomePreferences() {
  try { return parseWelcomePreferences(localStorage.getItem(welcomePreferenceKeys.theme), localStorage.getItem(welcomePreferenceKeys.language)); }
  catch { return parseWelcomePreferences(null, null); }
}
