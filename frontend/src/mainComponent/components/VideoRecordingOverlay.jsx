import { useEffect, useRef, useState } from 'react';

/*
  [2.42.10] Оверлей записи видео-кружка. Квадрат с камерой по центру,
            кнопка смены камеры справа сверху, таймер слева сверху.
            Свайп вверх — отправить, вниз — отменить.
  [2.42.0] Первая версия.
*/

const SWIPE_THRESHOLD = 70;
const DIRECTION_LOCK = 10;
const HINT_KEY = 'ghost-chat-video-hint-shown';

const VideoRecordingOverlay = ({
  open,
  stream,
  duration = 0,
  facing = 'user',
  frozen = false,
  onSwitchCamera,
  onSend,
  onCancel,
}) => {
  const [dragY, setDragY] = useState(0);
  const [hint, setHint] = useState(null);
  const [infoTip, setInfoTip] = useState(false);

  const gestureRef = useRef({ active: false, startY: 0, startX: 0, dir: null, moved: false });
  const videoRef = useRef(null);

  // Привязка stream к <video>
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      try { v.srcObject = stream; } catch { /* noop */ }
    } else {
      v.srcObject = null;
    }
  }, [stream]);

  // Один раз за сессию — подсказка про 1 минуту
  useEffect(() => {
    if (!open) return;
    let shown = false;
    try { shown = sessionStorage.getItem(HINT_KEY) === '1'; } catch { /* noop */ }
    if (shown) return;
    try { sessionStorage.setItem(HINT_KEY, '1'); } catch { /* noop */ }
    setInfoTip(true);
    const t = setTimeout(() => setInfoTip(false), 3000);
    return () => clearTimeout(t);
  }, [open]);

  // Сброс состояния при закрытии
  useEffect(() => {
    if (!open) {
      setDragY(0);
      setHint(null);
      gestureRef.current.active = false;
      gestureRef.current.dir = null;
    }
  }, [open]);

  if (!open) return null;

  const sec = Math.floor(duration);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');

  const handlePointerDown = (e) => {
    gestureRef.current = {
      active: true,
      startY: e.clientY,
      startX: e.clientX,
      dir: null,
      moved: false,
    };
  };

  const handlePointerMove = (e) => {
    const g = gestureRef.current;
    if (!g.active) return;
    const dy = e.clientY - g.startY;
    const dx = e.clientX - g.startX;

    if (!g.dir) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      g.dir = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
    }
    if (g.dir !== 'vertical') return;

    g.moved = true;
    setDragY(dy);

    if (dy <= -SWIPE_THRESHOLD) setHint('send');
    else if (dy >= SWIPE_THRESHOLD) setHint('cancel');
    else setHint(null);
  };

  const handlePointerUp = () => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;

    if (g.moved) {
      if (dragY <= -SWIPE_THRESHOLD) onSend?.();
      else if (dragY >= SWIPE_THRESHOLD) onCancel?.();
    }

    g.dir = null;
    g.moved = false;
    setDragY(0);
    setHint(null);
  };

  const handlePointerCancel = () => {
    gestureRef.current.active = false;
    gestureRef.current.dir = null;
    gestureRef.current.moved = false;
    setDragY(0);
    setHint(null);
  };

  const dragProgress = Math.min(1, Math.abs(dragY) / SWIPE_THRESHOLD);
  const scale = 1 + dragProgress * 0.1;
  const opacity = 1 - dragProgress * 0.25;

  return (
    <div className="video-rec-overlay">
      <div
        className={
          `video-rec-inner` +
          (frozen ? ' video-rec-inner--frozen' : '') +
          (hint ? ` video-rec-inner--hint-${hint}` : '')
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="video-rec-top-hint" aria-hidden="true">
          <span className="video-rec-arrow video-rec-arrow--up">↑</span>
          <span className="video-rec-hint-text">Потяни вверх, чтобы отправить</span>
          <span className="video-rec-arrow video-rec-arrow--up">↑</span>
        </div>

        <div
          className="video-rec-square-wrap"
          style={{
            transform: `translateY(${dragY * 0.3}px) scale(${scale})`,
            opacity,
            transition: gestureRef.current.active
              ? 'none'
              : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s',
          }}
        >
          <div className="video-rec-square">
            <video
              ref={videoRef}
              className={`video-rec-video${facing === 'user' ? ' video-rec-video--mirror' : ''}`}
              autoPlay
              playsInline
              muted
            />
            {!stream && (
              <div className="video-rec-placeholder" aria-hidden="true" />
            )}

            <button
              type="button"
              className="video-rec-switch"
              onClick={(e) => { e.stopPropagation(); onSwitchCamera?.(); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Переключить камеру"
              title="Переключить камеру"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                <path d="M15 11a3 3 0 1 1-3-3" />
                <path d="M14 6l2 2-2 2" />
              </svg>
            </button>

            <div className="video-rec-timer">
              <span className={`video-rec-dot${frozen ? ' video-rec-dot--frozen' : ''}`} aria-hidden="true" />
              <span className="video-rec-time">{mm}:{ss}</span>
            </div>
          </div>
        </div>

        <div className="video-rec-bottom-hint" aria-hidden="true">
          <span className="video-rec-arrow video-rec-arrow--down">↓</span>
          <span className="video-rec-hint-text">Потяни вниз, чтобы отменить</span>
          <span className="video-rec-arrow video-rec-arrow--down">↓</span>
        </div>

        {infoTip && (
          <div className="video-rec-info-tip" role="status" aria-live="polite">
            Максимум 1 минута
          </div>
        )}

        <div
          className="video-rec-drag-progress video-rec-drag-progress--send"
          style={{ opacity: hint === 'send' ? dragProgress : 0 }}
          aria-hidden="true"
        />
        <div
          className="video-rec-drag-progress video-rec-drag-progress--cancel"
          style={{ opacity: hint === 'cancel' ? dragProgress : 0 }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

export default VideoRecordingOverlay;