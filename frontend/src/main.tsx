import React from 'react';
import ReactDOM from 'react-dom/client';
import { Entry } from './app/Entry';
import { ThemeProvider } from './shared/providers/ThemeProvider';
import './shared/styles/index.css';
import './shared/styles/theme.css';

// Older versions saved private rows without an owner. Never import this shared history.
try { localStorage.removeItem('unsupervised-runs-v1'); } catch { /* Storage can be disabled. */ }

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider><Entry /></ThemeProvider>
  </React.StrictMode>
);
