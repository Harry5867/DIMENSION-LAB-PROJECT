import { Moon, Sun } from 'lucide-react';
import { useAppTheme } from './ThemeProvider';
import { useAppLanguage } from './WelcomeLanguage';

export function ThemeToggle() {
  const { theme, toggleTheme } = useAppTheme();
  const { tr } = useAppLanguage();
  const label = tr(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={label} title={label}>
    {theme === 'dark' ? <Sun size={17} strokeWidth={1.5} aria-hidden="true" /> : <Moon size={17} strokeWidth={1.5} aria-hidden="true" />}
  </button>;
}
