import { Globe2, Moon, Sun } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useWelcomeLanguage } from './WelcomeLanguage';
import type { WelcomeTheme } from '../utils/welcomePreferences';
import './welcome-settings.css';

export function WelcomeSettings({ theme, onTheme }: {
  theme: WelcomeTheme; onTheme: (theme: WelcomeTheme) => void;
}) {
  const { language, setLanguage, t } = useWelcomeLanguage();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const options = [
    { value: 'light', label: t('Light mode', 'Giao diện sáng'), Icon: Sun },
    { value: 'dark', label: t('Dark mode', 'Giao diện tối'), Icon: Moon },
  ] as const;
  return <div className="welcome-settings">
    <div className="welcome-appearance" role="group" aria-label={t('Appearance', 'Giao diện')}>
      {options.map(({ value, label, Icon }) => <button key={value} type="button" className="welcome-setting-control welcome-appearance-option"
        aria-label={label} title={label} aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></button>)}
    </div>
    <div className="welcome-language" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
    }}>
      <button ref={trigger} type="button" className="welcome-setting-control welcome-appearance-option"
        aria-label={t('Language', 'Ngôn ngữ')} aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(value => !value)}><Globe2 size={17} strokeWidth={1.6} aria-hidden="true" /></button>
      <div className="welcome-language-options" id={menuId} hidden={!open}>
        {(['en', 'vi'] as const).map(value => <button key={value} type="button"
          className="welcome-setting-control" lang={value} aria-pressed={language === value}
          onClick={() => { setLanguage(value); close(); }}>{value === 'en' ? 'English' : 'Tiếng Việt'}</button>)}
      </div>
    </div>
  </div>;
}
