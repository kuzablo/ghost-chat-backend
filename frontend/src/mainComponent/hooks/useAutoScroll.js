import { useEffect, useRef, useState } from 'react';

/*
  [2.35.15] scrollToBottom — instant, без smooth.
  [2.32.39] Второй ResizeObserver — запись scrollTop обёрнута в RAF.
  [2.32.22] скролл вниз только при новом последнем сообщении.
  [2.32.21] постоянный ResizeObserver: если юзер у низа — держим у низа.
  [2.32.8] первый скролл — мгновенный.
  [2.31.9] ResizeObserver на 2 секунды после mount для PWA.
  [2.18.6] подстраховка для картинок.
*/

export const useAutoScroll = ({ messages, resetKey }) => {
  const [showScrollDown, setShowScrollDown] = useState(false);

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastMsgIdRef = useRef(null);

  // Автоскролл: только при новом последнем сообщении
  useEffect(() => {
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;

    let raf1 = null;
    let raf2 = null;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    });

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [messages]);

  /* ResizeObserver — первые 2 секунды после mount (PWA) */
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    let alive = true;
    const start = Date.now();

    const ro = new ResizeObserver(() => {
      if (!alive) return;
      if (Date.now() - start > 2000) {
        ro.disconnect();
        return;
      }
      el.scrollTop = el.scrollHeight;
    });

    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);

    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [resetKey]);

  /* [2.32.21] постоянный ResizeObserver — держим скролл у низа,
     если юзер не ушёл вверх.
     [2.32.39] запись scrollTop в RAF — избегаем layout thrashing. */
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    const KEEP_BOTTOM_PX = 80;
    let rafId = null;

    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom < KEEP_BOTTOM_PX) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });

    ro.observe(el);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Индикатор «вниз»
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    let rafId = null;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollDown(distanceFromBottom > 200);
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', handleScroll);
    };
  }, [resetKey]);

  // [2.35.15] Мгновенный скролл. Плюс прелоад картинок из DOM
  // перед скроллом — чтобы «пустоты» не было.
  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    // Прелоад: все <img> внутри контейнера получают src, браузер их качает.
    const imgs = el.querySelectorAll('img');
    imgs.forEach((img) => {
      if (img.loading === 'lazy') img.loading = 'eager';
    });

    // Мгновенный скролл — без анимации, без промежуточных кадров.
    el.scrollTop = el.scrollHeight;
  };

  return {
    messagesContainerRef,
    messagesEndRef,
    showScrollDown,
    scrollToBottom,
  };
};