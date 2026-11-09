import React from 'react';
import ReactDOM from 'react-dom/client';
import { Entry } from './Entry';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLanguageProvider } from './components/WelcomeLanguage';
import './index.css';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider><AppLanguageProvider><Entry /></AppLanguageProvider></ThemeProvider>
  </React.StrictMode>
);
