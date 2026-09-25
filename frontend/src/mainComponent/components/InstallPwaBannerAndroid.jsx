import { useEffect, useState } from 'react';

/*
  [2.35.12] Android-баннер установки PWA.
            Ловим beforeinstallprompt, показываем кнопку.
            Скрываем, если приложение уже установлено (standalone).
*/
const InstallPwaBannerAndroid = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches;

    if (isStandalone) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA-Android] установлено');
      } else {
        console.log('[PWA-Android] отменено');
      }
    } catch (err) {
      console.warn('[PWA-Android] ошибка prompt:', err);
    } finally {
      setDeferredPrompt(null);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
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
            Нажми <b>Установить</b> — иконка появится на домашнем экране
          </span>
        </div>

        <div className="pwa-banner-step">
          <span className="pwa-banner-step-num">2</span>
          <span className="pwa-banner-step-text">
            Открывай как обычное приложение — без адресной строки
          </span>
        </div>

        <button
          type="button"
          className="pwa-banner-ok"
          onClick={handleInstall}
        >
          Установить
        </button>
      </div>
    </div>
  );
};

export default InstallPwaBannerAndroid;