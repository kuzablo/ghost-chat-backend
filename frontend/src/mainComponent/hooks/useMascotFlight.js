import { useRef, useState, useCallback, useEffect } from 'react';

/*
  [2.39.8] Crossfade при приземлении. Раньше: onfinish → setFlying(false)
           → React рисует целевой маскот → летающий удаляется. Между
           этими состояниями — один кадр с двумя элементами, размеры
           на стыке дают видимый скачок (border 2px + layout vs transform).
           Теперь: последние 20% времени полёта opacity летающего 1 → 0.
           setFlying(false) срабатывает в самом конце — когда летающий
           уже невидим. Целевой элемент появляется под ним. Никакого
           прыжка размера.
  [2.39.7] Убран fade-in летающего.
  [2.39.5] Анимация left/top/width/height — border не масштабируется.
  [2.39.4] fromLanded.
  [2.39.3] Целевая точка = центр элемента + размер size.
*/

const DEFAULT_DURATION = 700;
const CENTER_SIZE = 82;
const FADE_START = 0.8;      // последние 20% — fade out
const FINISH_GRACE_MS = 50;  // запас перед удалением DOM-элемента

const getRect = (el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
};

const getTargetRect = (el, size) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!size) {
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return {
    left: r.left + r.width / 2 - size / 2,
    top: r.top + r.height / 2 - size / 2,
    width: size,
    height: size,
  };
};

const isUsableRect = (r) => r && r.width > 0 && r.height > 0;

const getCenterRect = (size) => ({
  left: (window.innerWidth - size) / 2,
  top: (window.innerHeight - size) / 2,
  width: size,
  height: size,
});

export const useMascotFlight = ({
  fromRef,
  toRef,
  duration = DEFAULT_DURATION,
  onLand,
} = {}) => {
  const [flying, setFlying] = useState(false);

  const flyingRef = useRef(false);
  const nodeRef = useRef(null);
  const animRef = useRef(null);
  const mountedRef = useRef(true);
  const lastLandedRectRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { animRef.current?.cancel(); } catch { /* noop */ }
      try { nodeRef.current?.remove(); } catch { /* noop */ }
      nodeRef.current = null;
      animRef.current = null;
      flyingRef.current = false;
    };
  }, []);

  const startFlight = useCallback((options = {}) => {
    const {
      reverse = false,
      fromLanded = false,
      fromRef: fromRefOverride,
      fromSize = null,
      toRef: toRefOverride,
      toSize = null,
    } = options;

    if (flyingRef.current) return;

    let from = null;
    let to = null;

    const targetEl = toRefOverride?.current || toRef?.current;

    if (reverse) {
      from = fromRefOverride?.current
        ? getTargetRect(fromRefOverride.current, fromSize)
        : lastLandedRectRef.current;
      to = getRect(fromRef?.current);
    } else if (fromRefOverride) {
      from = getTargetRect(fromRefOverride.current, fromSize);
      to = getTargetRect(targetEl, toSize);
    } else if (fromLanded) {
      from = lastLandedRectRef.current;
      to = getTargetRect(targetEl, toSize);
    } else {
      from = getTargetRect(fromRef?.current, fromSize);
      to = getTargetRect(targetEl, toSize);
    }

    if (!isUsableRect(from)) {
      console.warn('[useMascotFlight] нет источника — не летим');
      return;
    }

    if (!isUsableRect(to)) {
      console.warn('[useMascotFlight] цель 0×0, летим в центр', to);
      to = getCenterRect(toSize || CENTER_SIZE);
    }

    const el = document.createElement('div');
    el.className = 'mascot-flying';
    el.style.left = `${from.left}px`;
    el.style.top = `${from.top}px`;
    el.style.width = `${from.width}px`;
    el.style.height = `${from.height}px`;
    document.body.appendChild(el);
    nodeRef.current = el;

    flyingRef.current = true;
    setFlying(true);

    // [2.39.8] Ключевые кадры: 0% — старт, 80% — ещё полностью видим,
    // 100% — opacity 0. Так летающий плавно растворяется в точке
    // приземления, а целевой маскот уже на месте под ним.
    const anim = el.animate(
      [
        {
          left: `${from.left}px`,
          top: `${from.top}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
          opacity: 1,
          offset: 0,
        },
        {
          left: `${to.left}px`,
          top: `${to.top}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          opacity: 1,
          offset: FADE_START,
        },
        {
          left: `${to.left}px`,
          top: `${to.top}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      }
    );
    animRef.current = anim;

    anim.onfinish = () => {
      lastLandedRectRef.current = to;
      if (!mountedRef.current) {
        try { el.remove(); } catch { /* noop */ }
        return;
      }
      flyingRef.current = false;
      setFlying(false);
      if (onLand) onLand();
      // Небольшая пауза перед удалением — даём React отрисовать целевой
      // элемент. Летающий уже невидим (opacity 0), наложения не видно.
      setTimeout(() => {
        try { el.remove(); } catch { /* noop */ }
      }, FINISH_GRACE_MS);
    };
  }, [fromRef, toRef, duration, onLand]);

  const cancelFlight = useCallback(() => {
    if (!flyingRef.current) return;
    try { animRef.current?.cancel(); } catch { /* noop */ }
    try { nodeRef.current?.remove(); } catch { /* noop */ }
    nodeRef.current = null;
    animRef.current = null;
    flyingRef.current = false;
    setFlying(false);
  }, []);

  return { flying, startFlight, cancelFlight };
};