import { Globe2, Monitor, Moon, Sun } from 'lucide-react';
import { useWelcomeLanguage } from './WelcomeLanguage';
import type { WelcomeTheme } from '../utils/welcomePreferences';
import './welcome-settings.css';

export function WelcomeSettings({ theme, onTheme }: {
  theme: WelcomeTheme; onTheme: (theme: WelcomeTheme) => void;
}) {
  const { language, setLanguage, t } = useWelcomeLanguage();
  const options = [
    { value: 'system', label: t('Use system appearance', 'Theo giao diện hệ thống'), Icon: Monitor },
    { value: 'light', label: t('Light mode', 'Giao diện sáng'), Icon: Sun },
    { value: 'dark', label: t('Dark mode', 'Giao diện tối'), Icon: Moon },
  ] as const;
  return <div className="welcome-settings">
    <div className="welcome-appearance" role="group" aria-label={t('Appearance', 'Giao diện')}>
      {options.map(({ value, label, Icon }) => <button key={value} type="button" className="welcome-setting-control welcome-appearance-option"
        aria-label={label} title={label} aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></button>)}
    </div>
    <label className="welcome-language">
      <Globe2 size={16} strokeWidth={1.6} aria-hidden="true" />
      <span className="sr-only">{t('Language', 'Ngôn ngữ')}</span>
      <select className="welcome-setting-control" value={language}
        onChange={event => setLanguage(event.currentTarget.value === 'vi' ? 'vi' : 'en')}>
        <option value="en" lang="en">English</option>
        <option value="vi" lang="vi">Tiếng Việt</option>
      </select>
    </label>
  </div>;
}
