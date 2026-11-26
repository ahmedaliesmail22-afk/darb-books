import React from 'react';
import { createRoot } from 'react-dom/client';
import '@darb/book-engine/styles/tokens.css';
import '@darb/book-engine/styles/themes.css';
import '@darb/book-engine/styles/modals.css';
import './styles/portal.css';
import { App } from './App';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
      };
    };
  }
}

if (window.Telegram?.WebApp?.ready) {
  try {
    window.Telegram.WebApp.ready();
  } catch {
    // ignore outside Telegram
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
