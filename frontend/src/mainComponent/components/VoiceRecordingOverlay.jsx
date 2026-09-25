import { useEffect, useRef, useState } from 'react';

/*
  [2.35.58] Оверлей записи голосового. Маскот в центре, полоса под ним.
  Тап — пауза/продолжить. Свайп вверх — отправить. Свайп вниз — отменить.
*/

const SWIPE_THRESHOLD = 70;
const DIRECTION_LOCK = 10;

const VoiceRecordingOverlay = ({
  open,
  duration = 0,
  level = 0,
  paused = false,
  frozen = false,
  onPause,
  onResume,
  onSend,
  onCancel,
}) => {
  const [dragY, setDragY] = useState(0);
  const [hint, setHint] = useState(null);
  const gestureRef = useRef({
    active: false,
    startY: 0,
    startX: 0,
    dir: null,
    moved: false,
  });

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

    if (!g.moved) {
      if (frozen) return;
      if (paused) onResume?.();
      else onPause?.();
    } else if (dragY <= -SWIPE_THRESHOLD) {
      onSend?.();
    } else if (dragY >= SWIPE_THRESHOLD) {
      onCancel?.();
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
  const mascotScale = 1 + dragProgress * 0.15;
  const mascotOpacity = 1 - dragProgress * 0.3;

  return (
    <div className="voice-rec-overlay">
      <div
        className={`voice-rec-overlay-inner ${paused ? 'voice-rec-overlay-inner--paused' : ''} ${frozen ? 'voice-rec-overlay-inner--frozen' : ''} ${hint ? `voice-rec-overlay-inner--hint-${hint}` : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="voice-rec-top-hint" aria-hidden="true">
          <span className="voice-rec-arrow voice-rec-arrow--up">↑</span>
          <span className="voice-rec-hint-text">Потяни вверх, чтобы отправить</span>
          <span className="voice-rec-arrow voice-rec-arrow--up">↑</span>
        </div>

        <div
          className="voice-rec-mascot-wrap"
          style={{
            transform: `translateY(${dragY * 0.4}px) scale(${mascotScale})`,
            opacity: mascotOpacity,
            transition: gestureRef.current.active ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s',
          }}
        >
          <div className={`voice-rec-mascot ${paused ? 'voice-rec-mascot--paused' : ''}`}>
            <img src="/mascot.png" alt="" draggable={false} />
            {!paused && !frozen && (
              <span className="voice-rec-mascot-halo" aria-hidden="true" />
            )}
          </div>

          {paused && !frozen && (
            <div className="voice-rec-mascot-badge voice-rec-mascot-badge--pause">
              ⏸
            </div>
          )}
          {frozen && (
            <div className="voice-rec-mascot-badge voice-rec-mascot-badge--frozen">
              ✓
            </div>
          )}
        </div>

        <div className="voice-rec-bar">
          <span className={`voice-rec-dot ${paused || frozen ? 'voice-rec-dot--paused' : ''}`} aria-hidden="true" />
          <span className="voice-rec-time">{mm}:{ss}</span>
          <div className="voice-rec-wave" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className="voice-rec-wave-col"
                style={{
                  animationDelay: `${(i % 5) * 0.1}s`,
                  animationPlayState: paused || frozen ? 'paused' : 'running',
                }}
              />
            ))}
          </div>
          {paused && !frozen && (
            <span className="voice-rec-tip">Пауза — тапни, чтобы продолжить</span>
          )}
          {frozen && (
            <span className="voice-rec-tip">Тапни и потяни</span>
          )}
        </div>

        <div className="voice-rec-bottom-hint" aria-hidden="true">
          <span className="voice-rec-arrow voice-rec-arrow--down">↓</span>
          <span className="voice-rec-hint-text">Потяни вниз, чтобы отменить</span>
          <span className="voice-rec-arrow voice-rec-arrow--down">↓</span>
        </div>

        <div
          className="voice-rec-drag-progress voice-rec-drag-progress--send"
          style={{ opacity: hint === 'send' ? dragProgress : 0 }}
          aria-hidden="true"
        />
        <div
          className="voice-rec-drag-progress voice-rec-drag-progress--cancel"
          style={{ opacity: hint === 'cancel' ? dragProgress : 0 }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

export default VoiceRecordingOverlay;