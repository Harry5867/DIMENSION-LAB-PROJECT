import React from 'react';
import ReactDOM from 'react-dom/client';
import { Entry } from './Entry';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Entry />
  </React.StrictMode>
);
