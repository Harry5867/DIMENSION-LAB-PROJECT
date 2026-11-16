import { Moon, Sun } from 'lucide-react';
import type { WelcomeTheme } from '../../shared/preferences/welcomePreferences';
import './styles/welcome-settings.css';

export function WelcomeSettings({ theme, onTheme }: {
  theme: WelcomeTheme; onTheme: (theme: WelcomeTheme) => void;
}) {
  const options = [
    { value: 'light', label: 'Light mode', Icon: Sun },
    { value: 'dark', label: 'Dark mode', Icon: Moon },
  ] as const;
  return <div className="welcome-appearance" role="group" aria-label="Appearance">
      {options.map(({ value, label, Icon }) => <button key={value} type="button" className="welcome-setting-control welcome-appearance-option"
        aria-label={label} title={label} aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></button>)}
  </div>;
}
