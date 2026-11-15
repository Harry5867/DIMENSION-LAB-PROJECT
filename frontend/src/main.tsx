import React from 'react';
import ReactDOM from 'react-dom/client';
import { Entry } from './app/Entry';
import { ThemeProvider } from './shared/providers/ThemeProvider';
import { AppLanguageProvider } from './shared/providers/WelcomeLanguage';
import './shared/styles/index.css';
import './shared/styles/theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider><AppLanguageProvider><Entry /></AppLanguageProvider></ThemeProvider>
  </React.StrictMode>
);
