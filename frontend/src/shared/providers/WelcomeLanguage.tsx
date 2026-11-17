import type { WelcomeLanguage } from '../preferences/welcomePreferences';

type Translation = (english: string, vietnamese: string) => string;
interface AppLanguage {
  language: WelcomeLanguage;
  t: Translation;
  tr: (english: string) => string;
}
const english: AppLanguage = { language: 'en', t: text => text, tr: text => text };
export const useAppLanguage = () => english;
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
