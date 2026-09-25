import { useEffect, useRef, useState, useCallback } from 'react';

/*
  [2.37.0] Проверка новой версии фронта через /version.json.
  Свой buildId зашит в бандл (Vite define __BUILD_ID__).
  Раз в intervalMs и при возврате на вкладку — запрос с no-store.
  Если buildId на сервере отличается — updateAvailable = true.
*/

const CURRENT_BUILD_ID =
  typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_BETWEEN_CHECKS_MS = 30 * 1000;

export const useVersionCheck = ({ intervalMs = DEFAULT_INTERVAL_MS } = {}) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckRef = useRef(0);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    if (Date.now() - lastCheckRef.current < MIN_INTERVAL_BETWEEN_CHECKS_MS) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.buildId && data.buildId !== CURRENT_BUILD_ID) {
        setUpdateAvailable(true);
      }
    } catch { /* noop */ }
    finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);

    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [check, intervalMs]);

  const reload = useCallback(() => {
    try { location.reload(); } catch { /* noop */ }
  }, []);

  return { updateAvailable, reload, currentBuildId: CURRENT_BUILD_ID };
};