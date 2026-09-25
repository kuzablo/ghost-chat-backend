import { useState, useEffect, useCallback } from 'react';

/*
  [2.36.7] Убран автоскрывающий таймер activeMessageId (2000мс).
           Он unmount-ил ReactionWheel раньше его собственного таймера,
           из-за чего «+» не давал пользователю дополнительного времени.
           Сброс теперь только явный: по onClose из ReactionWheel или
           по выбору реакции — оба пути идут через toggleReactions.
  [2.35.27] Тема вынесена из React state. Только DOM — нет ререндера при смене.
            Круг через View Transition сохраняется.
  [2.35.26] theme-switching гасит CSS transitions при смене темы
  [2.32.39] useCallback на toggleReactions/closeFullscreen
*/

export const useChatUI = () => {
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [banConfirm, setBanConfirm] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [showFullscreenReactions, setShowFullscreenReactions] = useState(false);
  const [showMobileInput, setShowMobileInput] = useState(false);

  // [2.35.27] Один раз при mount — синхронизируем DOM с localStorage.
  // Больше React к теме не прикасается.
  useEffect(() => {
    let stored = 'light';
    try { stored = localStorage.getItem('ghost-chat-theme') || 'light'; } catch { /* noop */ }
    document.body.classList.toggle('dark', stored === 'dark');
  }, []);

  const toggleTheme = useCallback((event) => {
    // [2.35.27] Никакого setIsDark. Ноль ререндеров React.
    const isDarkNow = document.body.classList.contains('dark');
    const next = !isDarkNow;

    const x = event?.clientX ?? window.innerWidth - 30;
    const y = event?.clientY ?? 30;

    const freeze = () => document.body.classList.add('theme-switching');
    const unfreeze = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.remove('theme-switching');
        });
      });
    };

    const applyClass = () => {
      document.body.classList.toggle('dark', next);
      try {
        localStorage.setItem('ghost-chat-theme', next ? 'dark' : 'light');
      } catch { /* noop */ }
    };

    if (typeof document.startViewTransition !== 'function') {
      freeze();
      applyClass();
      unfreeze();
      return;
    }

    const transition = document.startViewTransition(() => {
      freeze();
      applyClass();
    });

    transition.ready
      .then(() => {
        const radius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y)
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 320,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => { /* noop */ });

    transition.finished
      .then(unfreeze)
      .catch(unfreeze);
  }, []);

  const toggleReactions = useCallback((messageId) => {
    setActiveMessageId(prev => (prev === messageId ? null : messageId));
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenImage(null);
    setShowFullscreenReactions(false);
  }, []);

  return {
    toggleTheme,
    activeMessageId, setActiveMessageId,
    toggleReactions,
    showPlayers, setShowPlayers,
    showInfo, setShowInfo,
    searchQuery, setSearchQuery,
    banConfirm, setBanConfirm,
    fullscreenImage, setFullscreenImage,
    showFullscreenReactions, setShowFullscreenReactions,
    closeFullscreen,
    showMobileInput, setShowMobileInput,
  };
};