import { useRef, useState, useCallback, useEffect } from 'react';

/*
  [2.37.5] Хук жестов мобильной капсулы: тап для открытия,
           свайп вверх — открыть + клавиатура, свайп вниз — закрыть.
           Вынесен из Chat.jsx (~70 строк inline).
  Зависимости от родителя (showMobileInput, setShowMobileInput,
  togglePlayers) передаются аргументами и держатся в refs —
  чтобы колбэки были стабильными.
*/

const CAPSULE_SWIPE_UP = 30;
const CAPSULE_SWIPE_DOWN = 40;
const CAPSULE_DIRECTION_LOCK = 8;

export const useCapsuleGestures = ({
  showMobileInput,
  setShowMobileInput,
  togglePlayers,
}) => {
  const [capsuleOpen, setCapsuleOpen] = useState(false);

  const capsuleSwipeRef = useRef({
    startX: 0,
    startY: 0,
    active: false,
    didSwipe: false,
    direction: null,
  });

  const showMobileInputRef = useRef(showMobileInput);
  const setShowMobileInputRef = useRef(setShowMobileInput);
  const togglePlayersRef = useRef(togglePlayers);

  useEffect(() => { showMobileInputRef.current = showMobileInput; }, [showMobileInput]);
  useEffect(() => { setShowMobileInputRef.current = setShowMobileInput; }, [setShowMobileInput]);
  useEffect(() => { togglePlayersRef.current = togglePlayers; }, [togglePlayers]);

  const handleCapsuleTap = useCallback(() => {
    if (capsuleSwipeRef.current.didSwipe) return;
    if (!capsuleOpen) setCapsuleOpen(true);
  }, [capsuleOpen]);

  const handlePlayersCapsuleTap = useCallback((e) => {
    e.stopPropagation();
    togglePlayersRef.current?.();
    setCapsuleOpen(false);
  }, []);

  const handleWriteCapsuleTap = useCallback((e) => {
    e.stopPropagation();
    setShowMobileInputRef.current?.((v) => !v);
    setCapsuleOpen(false);
  }, []);

  const handleCapsuleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    capsuleSwipeRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      active: true,
      didSwipe: false,
      direction: null,
    };
  }, []);

  const handleCapsuleTouchMove = useCallback((e) => {
    const s = capsuleSwipeRef.current;
    if (!s.active) return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;

    if (!s.direction) {
      if (
        Math.abs(dx) < CAPSULE_DIRECTION_LOCK &&
        Math.abs(dy) < CAPSULE_DIRECTION_LOCK
      ) {
        return;
      }
      s.direction = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
    }
    if (s.direction === 'horizontal') return;

    if (e.cancelable) e.preventDefault();

    if (dy <= -CAPSULE_SWIPE_UP) {
      s.didSwipe = true;
      s.active = false;

      if (!capsuleOpen) {
        setCapsuleOpen(true);
        setShowMobileInputRef.current?.(true);
      } else if (!showMobileInputRef.current) {
        setShowMobileInputRef.current?.(true);
      }
      return;
    }

    if (dy >= CAPSULE_SWIPE_DOWN) {
      s.didSwipe = true;
      s.active = false;

      if (showMobileInputRef.current) {
        setShowMobileInputRef.current?.(false);
      } else if (capsuleOpen) {
        setCapsuleOpen(false);
      }
    }
  }, [capsuleOpen]);

  const handleCapsuleTouchEnd = useCallback(() => {
    const s = capsuleSwipeRef.current;
    s.active = false;
    if (s.didSwipe) {
      setTimeout(() => {
        if (capsuleSwipeRef.current) {
          capsuleSwipeRef.current.didSwipe = false;
        }
      }, 250);
    }
  }, []);

  return {
    capsuleOpen,
    handleCapsuleTap,
    handlePlayersCapsuleTap,
    handleWriteCapsuleTap,
    handleCapsuleTouchStart,
    handleCapsuleTouchMove,
    handleCapsuleTouchEnd,
  };
};