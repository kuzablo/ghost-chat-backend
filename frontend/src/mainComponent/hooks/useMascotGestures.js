import { useRef, useState, useEffect, useCallback } from 'react';

/*
  [2.37.4] Хук жестов маскота: тап / long-press / drag-громкость.
           Вынесен из Chat.jsx — там было ~80 строк inline.
  Принимает yt — результат useYouTubePlayer. Внутри себя не вызывает
  хук, чтобы не создавать второй player в системе.
*/

const LONG_PRESS_MS = 600;
const VOLUME_PIXELS_PER_PERCENT = 2;

export const useMascotGestures = (yt) => {
  const [volumeTipVisible, setVolumeTipVisible] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);

  const mascotGestureRef = useRef({
    startY: 0,
    startTime: 0,
    volumeBase: 50,
    inVolumeDrag: false,
    longPressTimer: null,
    longPressFired: false,
    pointerId: null,
    lastTapTime: 0,
  });

  // Автоскрытие мини-плеера, когда трек стартовал
  useEffect(() => {
    if (!showMiniPlayer) return;
    if (!yt.hasStarted) return;
    setShowMiniPlayer(false);
  }, [showMiniPlayer, yt.hasStarted]);

  const handleMascotPointerDown = useCallback((e) => {
    const ref = mascotGestureRef.current;
    ref.startY = e.clientY;
    ref.startTime = Date.now();
    ref.volumeBase = yt.volume;
    ref.inVolumeDrag = false;
    ref.longPressFired = false;
    ref.pointerId = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }

    ref.longPressTimer = setTimeout(() => {
      ref.longPressFired = true;
      ref.longPressTimer = null;

      if (!yt.hasStarted) {
        setShowMiniPlayer(true);
        yt.next();
      } else {
        yt.next();
      }
    }, LONG_PRESS_MS);
  }, [yt]);

  const handleMascotPointerMove = useCallback((e) => {
    const ref = mascotGestureRef.current;
    if (ref.pointerId !== e.pointerId) return;
    const dy = e.clientY - ref.startY;

    if (Math.abs(dy) > 8) {
      if (!ref.inVolumeDrag) {
        ref.inVolumeDrag = true;
        if (ref.longPressTimer) {
          clearTimeout(ref.longPressTimer);
          ref.longPressTimer = null;
        }
        setVolumeTipVisible(true);
      }
      const delta = -dy / VOLUME_PIXELS_PER_PERCENT;
      yt.setVolume(ref.volumeBase + delta);
    }
  }, [yt]);

  const handleMascotPointerUp = useCallback((e) => {
    const ref = mascotGestureRef.current;
    if (ref.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    ref.pointerId = null;

    if (ref.longPressTimer) {
      clearTimeout(ref.longPressTimer);
      ref.longPressTimer = null;
    }

    if (ref.inVolumeDrag) {
      ref.inVolumeDrag = false;
      setTimeout(() => setVolumeTipVisible(false), 600);
      return;
    }

    if (ref.longPressFired) {
      ref.longPressFired = false;
      ref.lastTapTime = 0;
      return;
    }

    if (!yt.hasStarted) {
      return;
    }

    yt.toggle();
  }, [yt]);

  const handleMascotContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  return {
    volumeTipVisible,
    showMiniPlayer,
    handleMascotPointerDown,
    handleMascotPointerMove,
    handleMascotPointerUp,
    handleMascotContextMenu,
  };
};