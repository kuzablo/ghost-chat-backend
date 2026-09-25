import { useEffect, useState } from 'react';

/*
  [2.31.8] iOS Safari — баннер с инструкцией по установке PWA.
           Показывается один раз (localStorage), только Safari,
           только iOS, только если ещё не в standalone-режиме.
*/

const STORAGE_KEY = 'ghost-chat-pwa-banner-seen';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

const isSafari = () => {
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA/.test(ua)) return false;
  return /Safari/.test(ua);
};

const isStandalone = () => {
  if (typeof navigator === 'undefined') return false;
  if (navigator.standalone === true) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
};

const InstallPwaBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIos()) return;
    if (!isSafari()) return;
    if (isStandalone()) return;

    let seen = false;
    try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* noop */ }
    if (seen) return;

    setVisible(true);
  }, []);

  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pwa-banner-overlay" onClick={handleDismiss}>
      <div className="pwa-banner" onClick={(e) => e.stopPropagation()}>
        <div className="pwa-banner-title">
          📱 Установи crew как приложение
        </div>

        <div className="pwa-banner-step">
          <span className="pwa-banner-step-num">1</span>
          <span className="pwa-banner-step-text">
            Нажми <b>Поделиться</b>
          </span>
          <svg
            className="pwa-banner-share-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4" />
            <path d="M8 8l4-4 4 4" />
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
        </div>

        <div className="pwa-banner-step">
          <span className="pwa-banner-step-num">2</span>
          <span className="pwa-banner-step-text">
            Выбери <b>На экран «Домой»</b>
          </span>
        </div>

        <button
          type="button"
          className="pwa-banner-ok"
          onClick={handleDismiss}
        >
          Понятно
        </button>
      </div>
    </div>
  );
};

export default InstallPwaBanner;