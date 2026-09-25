import { useRef, useState, useEffect, useCallback } from 'react';

/*
  [2.37.6] Хук жестов fullscreen-просмотра фото: свайп влево/вправо
           между фото, свайп вниз — закрыть, двойной тап — ❤️.
           Плюс toggle/close/reaction-wheel.
           Вынесен из Chat.jsx (~150 строк inline).
  Всё, что зависит от текущей картинки, считается внутри хука.
  Что нужно для JSX (индексы, счётчик) — Chat.jsx считает сам.
*/

const FS_SWIPE_THRESHOLD = 80;
const FS_CLOSE_THRESHOLD = 120;
const FS_DOUBLE_TAP_MS = 250;
const WHEEL_NEED_PX = 136;

export const useFullscreenGestures = ({
  fullscreenImage,
  setFullscreenImage,
  closeFullscreen,
  showFullscreenReactions,
  setShowFullscreenReactions,
  imageMessages,
  messages,
  nickname,
  sendReaction,
}) => {
  const [fsHeart, setFsHeart] = useState(null);
  const [fsReactionListEmoji, setFsReactionListEmoji] = useState(null);
  const [fsReactionAnchor, setFsReactionAnchor] = useState(null);

  const fsImgRef = useRef(null);
  const fsOverlayRef = useRef(null);

  const fsGestureRef = useRef({
    startX: 0,
    startY: 0,
    direction: null,
    active: false,
    lastDx: 0,
    lastDy: 0,
  });
  const fsLastTapRef = useRef(0);
  const fsTapPosRef = useRef({ x: 0, y: 0 });

  // Сброс transform при смене фото
  useEffect(() => {
    if (!fullscreenImage) return;
    const img = fsImgRef.current;
    if (img) {
      img.style.transition = '';
      img.style.transform = '';
    }
    const ov = fsOverlayRef.current;
    if (ov) {
      ov.style.background = '';
    }
  }, [fullscreenImage?.messageId]);

  // Авто-закрытие, если текущее фото исчезло из списка
  useEffect(() => {
    if (!fullscreenImage) return;
    const idx = imageMessages.findIndex(m => m.id === fullscreenImage.messageId);
    if (idx === -1) {
      closeFullscreen();
    }
  }, [fullscreenImage, imageMessages, closeFullscreen]);

  const fsGoPrev = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!fullscreenImage) return;
    const idx = imageMessages.findIndex(m => m.id === fullscreenImage.messageId);
    if (idx <= 0) return;
    const prev = imageMessages[idx - 1];
    setFullscreenImage({ url: prev.imageUrl, messageId: prev.id });
  }, [fullscreenImage, imageMessages, setFullscreenImage]);

  const fsGoNext = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!fullscreenImage) return;
    const idx = imageMessages.findIndex(m => m.id === fullscreenImage.messageId);
    if (idx < 0 || idx >= imageMessages.length - 1) return;
    const next = imageMessages[idx + 1];
    setFullscreenImage({ url: next.imageUrl, messageId: next.id });
  }, [fullscreenImage, imageMessages, setFullscreenImage]);

  const handleFsTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    fsGestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      direction: null,
      active: true,
      lastDx: 0,
      lastDy: 0,
    };
  }, []);

  const handleFsTouchMove = useCallback((e) => {
    const g = fsGestureRef.current;
    if (!g.active) return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    if (!g.direction) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    const img = fsImgRef.current;
    if (!img) return;

    const currentIndex = fullscreenImage
      ? imageMessages.findIndex(m => m.id === fullscreenImage.messageId)
      : -1;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < imageMessages.length - 1;

    if (g.direction === 'horizontal') {
      if ((dx > 0 && hasPrev) || (dx < 0 && hasNext)) {
        g.lastDx = dx;
        img.style.transition = 'none';
        img.style.transform = `translate3d(${dx}px, 0, 0)`;
        if (e.cancelable) e.preventDefault();
      }
    } else {
      if (dy > 0) {
        g.lastDy = dy;
        const scale = Math.max(0.85, 1 - dy / 800);
        img.style.transition = 'none';
        img.style.transform = `translate3d(0, ${dy}px, 0) scale(${scale})`;
        const ov = fsOverlayRef.current;
        if (ov) {
          const alpha = Math.max(0.15, 0.95 - (dy / 200) * 0.6);
          ov.style.background = `rgba(10, 10, 10, ${alpha})`;
        }
        if (e.cancelable) e.preventDefault();
      }
    }
  }, [fullscreenImage, imageMessages]);

  const handleFsTouchEnd = useCallback((e) => {
    const g = fsGestureRef.current;
    g.active = false;

    const img = fsImgRef.current;
    if (!img) {
      g.direction = null;
      return;
    }

    if (!g.direction) {
      g.direction = null;
      return;
    }

    const t = e.changedTouches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    const currentIndex = fullscreenImage
      ? imageMessages.findIndex(m => m.id === fullscreenImage.messageId)
      : -1;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < imageMessages.length - 1;

    if (g.direction === 'horizontal') {
      img.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
      if (dx <= -FS_SWIPE_THRESHOLD && hasNext) {
        const next = imageMessages[currentIndex + 1];
        setFullscreenImage({ url: next.imageUrl, messageId: next.id });
      } else if (dx >= FS_SWIPE_THRESHOLD && hasPrev) {
        const prev = imageMessages[currentIndex - 1];
        setFullscreenImage({ url: prev.imageUrl, messageId: prev.id });
      } else {
        img.style.transform = 'translate3d(0,0,0)';
      }
    } else {
      if (dy > FS_CLOSE_THRESHOLD) {
        closeFullscreen();
      } else {
        img.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
        img.style.transform = 'translate3d(0,0,0) scale(1)';
        const ov = fsOverlayRef.current;
        if (ov) {
          ov.style.transition = 'background 0.25s';
          ov.style.background = '';
          setTimeout(() => {
            if (ov) ov.style.transition = '';
          }, 300);
        }
      }
    }

    g.direction = null;
  }, [fullscreenImage, imageMessages, setFullscreenImage, closeFullscreen]);

  const handleFsDoubleTap = useCallback((e) => {
    if (!fullscreenImage) return;
    const stage = e.currentTarget.closest('.fs-stage') || e.currentTarget;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const now = Date.now();
    const last = fsLastTapRef.current;
    const pos = fsTapPosRef.current;
    const isDouble =
      now - last < FS_DOUBLE_TAP_MS &&
      Math.abs(x - pos.x) < 40 &&
      Math.abs(y - pos.y) < 40;

    if (isDouble) {
      fsLastTapRef.current = 0;

      const msgId = fullscreenImage.messageId;
      const msg = messages.find(m => m.id === msgId);
      const alreadyHeart = msg?.reactions?.['❤️']?.includes(nickname);
      if (!alreadyHeart) {
        sendReaction(msgId, '❤️');
      }

      setFsHeart({ x, y, key: now });
      setTimeout(() => setFsHeart(null), 800);
    } else {
      fsLastTapRef.current = now;
      fsTapPosRef.current = { x, y };
    }
  }, [fullscreenImage, messages, nickname, sendReaction]);

  // [2.36.4] клик по «😀» в fullscreen — toggle общего ReactionWheel
  const handleFullscreenReactionToggle = useCallback((e) => {
    if (showFullscreenReactions) {
      setShowFullscreenReactions(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = Math.max(
      WHEEL_NEED_PX,
      Math.min(window.innerWidth - WHEEL_NEED_PX, cx)
    );
    const y = Math.max(
      WHEEL_NEED_PX,
      Math.min(window.innerHeight - WHEEL_NEED_PX, cy)
    );
    setFsReactionAnchor({ x, y });
    setShowFullscreenReactions(true);
  }, [showFullscreenReactions, setShowFullscreenReactions]);

  const handleFullscreenReactionPick = useCallback((emoji) => {
    if (!fullscreenImage) return;
    sendReaction(fullscreenImage.messageId, emoji);
    setShowFullscreenReactions(false);
  }, [fullscreenImage, sendReaction, setShowFullscreenReactions]);

  const handleFullscreenReactionClose = useCallback(() => {
    setShowFullscreenReactions(false);
  }, [setShowFullscreenReactions]);

  return {
    // refs
    fsImgRef,
    fsOverlayRef,
    // состояния, нужные JSX
    fsHeart,
    fsReactionListEmoji,
    setFsReactionListEmoji,
    fsReactionAnchor,
    // обработчики
    handleFsTouchStart,
    handleFsTouchMove,
    handleFsTouchEnd,
    handleFsDoubleTap,
    fsGoPrev,
    fsGoNext,
    handleFullscreenReactionToggle,
    handleFullscreenReactionPick,
    handleFullscreenReactionClose,
  };
};