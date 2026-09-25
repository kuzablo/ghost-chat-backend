import { useEffect, useState } from 'react';

/*
  [2.36.7] AUTOHIDE_MS 5000 → 8000. Внешние таймеры в useChatUI и
           PrivateChat убраны — логика автоскрытия теперь только здесь.
           Раньше родитель unmount-ил компонент раньше нашего таймера,
           из-за чего «+» не давал дополнительного времени.
  [2.36.4] ignoreSelector — не закрывать при pointerdown по элементу,
           совпавшему с селектором (нужно для кнопки-триггера в fullscreen).
           Плюс закрытие при скролле/свайпе/wheel за пределами колеса.
  [2.35.56] + сбрасывает таймер автоскрытия.
  [2.35.53] Радиальный пикер реакций — отдельный компонент.
*/

const REACTIONS_MAIN = ['👍', '❤️', '🔥', '😂', '😮', '😢'];
const REACTIONS_EXTRA = ['💀', '🎉', '🥰', '🤔', '✨', '👀', '🙈', '👏', '🤝', '🍕', '☕', '💯'];

const WHEEL_R_MAIN = 56;
const WHEEL_R_EXTRA = 104;
const WHEEL_BTN = 36;
const WHEEL_PAD = 14;
const AUTOHIDE_MS = 8000;
const SWIPE_SLOP = 12;

const polar = (r, angleDeg) => {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const ReactionWheel = ({
  open,
  anchorX,
  anchorY,
  boundsRef,
  reactions = {},
  nickname,
  onPick,
  onClose,
  ignoreSelector = null,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [center, setCenter] = useState(null);
  const [timerKey, setTimerKey] = useState(0);

  // Центр колеса + сброс таймера при открытии на новом месте
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setCenter(null);
      return;
    }
    if (typeof anchorX !== 'number' || typeof anchorY !== 'number') return;

    const bounds = boundsRef?.current?.getBoundingClientRect();
    const need = WHEEL_R_EXTRA + WHEEL_BTN / 2 + WHEEL_PAD;

    let cx = anchorX;
    let cy = anchorY;

    if (bounds) {
      const minX = bounds.left + need;
      const maxX = bounds.right - need;
      const minY = bounds.top + need;
      const maxY = bounds.bottom - need;

      cx = maxX > minX ? clamp(anchorX, minX, maxX) : (bounds.left + bounds.right) / 2;
      cy = maxY > minY ? clamp(anchorY, minY, maxY) : (bounds.top + bounds.bottom) / 2;
    }

    const dx = cx - anchorX;
    const dy = cy - anchorY;
    const shift = Math.hypot(dx, dy);
    const angle = shift > 1 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;

    setCenter({ cx, cy, ax: anchorX, ay: anchorY, shift, angle });
    setExpanded(false);
    setTimerKey(k => k + 1);
  }, [open, anchorX, anchorY, boundsRef]);

  // Автоскрытие. Единственный таймер для пикера.
  // Нажатие «+» меняет expanded → эффект пересоздаётся → 8 секунд заново.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose?.(), AUTOHIDE_MS);
    return () => clearTimeout(t);
  }, [open, expanded, timerKey, onClose]);

  // Тап/клик вне колеса
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (!t || !t.closest) { onClose?.(); return; }
      if (t.closest('.reaction-wheel')) return;
      if (t.closest('.reaction-wheel-anchor')) return;
      if (ignoreSelector && t.closest(ignoreSelector)) return;
      const bounds = boundsRef?.current;
      if (bounds && bounds.contains(t)) return;
      onClose?.();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, boundsRef, onClose, ignoreSelector]);

  // Скролл / wheel — закрыть
  useEffect(() => {
    if (!open) return;
    const onScrollOrWheel = () => onClose?.();
    document.addEventListener('scroll', onScrollOrWheel, true);
    document.addEventListener('wheel', onScrollOrWheel, { passive: true });
    return () => {
      document.removeEventListener('scroll', onScrollOrWheel, true);
      document.removeEventListener('wheel', onScrollOrWheel);
    };
  }, [open, onClose]);

  // Свайп пальцем за пределами колеса
  useEffect(() => {
    if (!open) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.target;
      if (t?.closest && (t.closest('.reaction-wheel') || t.closest('.reaction-wheel-anchor'))) {
        tracking = false;
        return;
      }
      if (ignoreSelector && t?.closest && t.closest(ignoreSelector)) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onTouchMove = (e) => {
      if (!tracking) return;
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > SWIPE_SLOP || Math.abs(dy) > SWIPE_SLOP) {
        tracking = false;
        onClose?.();
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, onClose, ignoreSelector]);

  // Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !center) return null;

  const { cx, cy, ax, ay, shift, angle } = center;
  const showAnchor = shift > 2;

  const renderOrbit = (emojis, radius, isExtra) => (
    <div className={`reaction-wheel-orbit ${isExtra ? 'reaction-wheel-orbit--extra' : 'reaction-wheel-orbit--main'}`}>
      {emojis.map((emoji, i) => {
        const angleDeg = (360 / emojis.length) * i;
        const pos = polar(radius, angleDeg);
        const isActive = (reactions[emoji] || []).includes(nickname);
        return (
          <button
            key={emoji}
            type="button"
            className={`reaction-wheel-btn ${isActive ? 'active' : ''}`}
            style={{
              left: pos.x - WHEEL_BTN / 2,
              top: pos.y - WHEEL_BTN / 2,
              animationDelay: `${i * 0.025}s`,
            }}
            onClick={() => onPick?.(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {showAnchor && (
        <div
          className="reaction-wheel-anchor"
          style={{
            left: cx,
            top: cy,
            '--rw-tx': `${ax - cx}px`,
            '--rw-ty': `${ay - cy}px`,
            '--rw-len': `${shift}px`,
            '--rw-angle': `${angle}deg`,
          }}
          aria-hidden="true"
        >
          <span className="reaction-wheel-anchor-line" />
          <span className="reaction-wheel-anchor-dot" />
        </div>
      )}

      <div
        className={`reaction-wheel ${expanded ? 'reaction-wheel--expanded' : ''}`}
        style={{ left: cx, top: cy }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="reaction-wheel-center">
          <button
            type="button"
            className="reaction-wheel-toggle"
            onClick={() => {
              setExpanded(v => !v);
              setTimerKey(k => k + 1);
            }}
            aria-label={expanded ? 'Свернуть' : 'Ещё эмодзи'}
          >
            {expanded ? '−' : '＋'}
          </button>
        </div>
        {renderOrbit(REACTIONS_MAIN, WHEEL_R_MAIN, false)}
        {expanded && renderOrbit(REACTIONS_EXTRA, WHEEL_R_EXTRA, true)}
      </div>
    </>
  );
};

export default ReactionWheel;