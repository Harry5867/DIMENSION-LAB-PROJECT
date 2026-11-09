import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadWelcomePreferences, welcomePreferenceKeys, type WelcomeLanguage } from '../utils/welcomePreferences';
import { translateText } from '../utils/localization';

type Translation = (english: string, vietnamese: string) => string;
interface LanguageContext {
  language: WelcomeLanguage;
  setLanguage: (language: WelcomeLanguage) => void;
  t: Translation;
  tr: (english: string) => string;
}
const AppLanguageContext = createContext<LanguageContext>({ language: 'en', setLanguage: () => {}, t: english => english, tr: english => english });

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(() => loadWelcomePreferences().language);
  const t = useCallback<Translation>((english, vietnamese) => language === 'vi' ? vietnamese : english, [language]);
  const tr = useCallback((english: string) => translateText(english, language), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(welcomePreferenceKeys.language, language); } catch { /* Use the in-memory preference. */ }
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === welcomePreferenceKeys.language) setLanguage(loadWelcomePreferences().language);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const value = useMemo(() => ({ language, setLanguage, t, tr }), [language, t, tr]);
  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}
export const useAppLanguage = () => useContext(AppLanguageContext);
export const useWelcomeLanguage = useAppLanguage;

let vietnameseRegions: Intl.DisplayNames | undefined;
export function localizedCountry(iso: string, fallback: string, language: WelcomeLanguage) {
  if (language === 'en' || !iso) return fallback;
  try { vietnameseRegions ??= new Intl.DisplayNames(['vi'], { type: 'region' }); return vietnameseRegions.of(iso) ?? fallback; }
  catch { return fallback; }
}
export function storyTopicLabel(topic: string, language: WelcomeLanguage) {
  const names: Record<string, string> = { Healthcare: 'Y tế', Education: 'Giáo dục', Finance: 'Tài chính', Economy: 'Kinh tế', Sports: 'Thể thao', Environment: 'Môi trường', Technology: 'Công nghệ' };
  return language === 'vi' ? names[topic] ?? topic : topic;
}
