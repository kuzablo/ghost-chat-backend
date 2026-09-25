// [2.42.14] __frontVersion берётся из единственного источника —
//           ./version.js. Раньше здесь была мёртвая строка '2.37.3',
//           она уходила в client-error → ver=2.37.3 при живой 2.42.13.
//           Теперь в логах Amvera всегда фактическая версия бандла.
// [2.37.2] Диагностика: chat-render-start в Chat.jsx + ErrorBoundary
// + перехват console.error в index.html.
import { VERSION as FRONT_VERSION } from './version';

window.__frontVersion = FRONT_VERSION;

if (typeof window !== 'undefined' && typeof window.__clientLog === 'function') {
  window.__clientLog('module-load-start', 'main.jsx top reached');
} else if (typeof window !== 'undefined') {
  window.__clientLog = function () { /* noop */ };
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './mainComponent/ErrorBoundary.jsx';

try {
  if (localStorage.getItem('ghost-chat-theme') === 'dark') {
    document.body.classList.add('dark');
  }
} catch { /* noop */ }

let revealed = false;
window.__ready = function () {
  if (revealed) return;
  revealed = true;

  if (typeof window.__clientLog === 'function') {
    window.__clientLog('boot-ready-called', 'window.__ready invoked');
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('app-ready');
      const splash = document.getElementById('boot-splash');
      if (splash && splash.parentNode) {
        setTimeout(() => {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 360);
      }
    });
  });
};

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
  if (typeof window.__clientLog === 'function') {
    window.__clientLog('module-render-called', 'createRoot().render() done');
  }
} catch (err) {
  if (typeof window.__clientLog === 'function') {
    window.__clientLog(
      'render-throw',
      (err && err.message) || String(err),
      (err && err.stack) || ''
    );
  }
  throw err;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (typeof window.__clientLog === 'function') {
          window.__clientLog('sw-registered', reg.scope);
        }
        reg.update().catch(() => { /* noop */ });
      })
      .catch((err) => {
        if (typeof window.__clientLog === 'function') {
          window.__clientLog('sw-register-failed', (err && err.message) || String(err));
        }
      });
  });
}