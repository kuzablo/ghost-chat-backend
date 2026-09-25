import { useEffect, useRef } from 'react';

/*
  [2.48.13] Оптимизация:
  - Точка шага 4px → 8px. Точек вдвое меньше.
  - Throttle до 30 fps — каждый второй кадр. На 8px-полоске разницы
    глазом не видно, CPU в 2 раза меньше.
  - Точки собираются в массив и join — быстрее конкатенации.
  [2.33.8] Пульс комнаты.
*/
const RoomPulse = ({ playersCount = 0, typingCount = 0, isConnected = false }) => {
  const svgRef = useRef(null);
  const pathRef = useRef(null);

  const stateRef = useRef({
    amp: 0.5,
    freq: 1,
    speed: 0.008,
    targetAmp: 0.5,
    targetFreq: 1,
    targetSpeed: 0.008,
    phase: 0,
    raf: null,
    running: false,
    width: 0,
    height: 8,
    lastFrameTime: 0,
    lastWidth: 0,
  });

  useEffect(() => {
    const s = stateRef.current;

    const baseAmp = 0.6;
    const baseFreq = 1.0;
    const baseSpeed = 0.008;

    if (!isConnected) {
      s.targetAmp = 0.3;
      s.targetFreq = 0.6;
      s.targetSpeed = 0.004;
    } else {
      s.targetAmp = baseAmp + Math.min(playersCount, 8) * 0.25;
      s.targetFreq = baseFreq + Math.min(typingCount, 4) * 0.6;
      s.targetSpeed = baseSpeed + Math.min(typingCount, 4) * 0.006;
    }

    if (!s.running) {
      s.running = true;
      tick();
    }

    return () => {};
  }, [playersCount, typingCount, isConnected]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const rect = svg.getBoundingClientRect();
      const w = rect.width;
      // Пересчитываем сетку точек только если ширина реально изменилась.
      if (Math.abs(w - stateRef.current.lastWidth) > 1) {
        stateRef.current.width = w;
        stateRef.current.lastWidth = w;
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const tick = (time) => {
    const s = stateRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;

    if (!svg || !path) {
      s.running = false;
      return;
    }

    if (document.hidden) {
      s.raf = requestAnimationFrame(tick);
      return;
    }

    // [2.48.13] Throttle до 30 fps. На тонкой полоске разницы не видно.
    const now = time || performance.now();
    if (now - s.lastFrameTime < 33) {
      s.raf = requestAnimationFrame(tick);
      return;
    }
    s.lastFrameTime = now;

    s.amp += (s.targetAmp - s.amp) * 0.04;
    s.freq += (s.targetFreq - s.freq) * 0.04;
    s.speed += (s.targetSpeed - s.speed) * 0.04;

    s.phase += s.speed;

    const width = s.width;
    const height = s.height;
    if (width <= 0) {
      s.raf = requestAnimationFrame(tick);
      return;
    }

    const midY = height / 2;
    const step = 8;
    const pointsCount = Math.ceil(width / step);

    const parts = new Array(pointsCount + 1);
    for (let i = 0; i <= pointsCount; i++) {
      const x = i * step;
      const t = x / width;

      const y =
        midY +
        Math.sin(t * Math.PI * 2 * s.freq + s.phase) * s.amp +
        Math.sin(t * Math.PI * 4 * s.freq + s.phase * 1.3) * (s.amp * 0.25);

      parts[i] = i === 0
        ? `M ${x.toFixed(0)} ${y.toFixed(1)}`
        : `L ${x.toFixed(0)} ${y.toFixed(1)}`;
    }

    path.setAttribute('d', parts.join(' '));

    s.raf = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => {
      const s = stateRef.current;
      s.running = false;
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, []);

  return (
    <div className="room-pulse" aria-hidden="true">
      <svg
        ref={svgRef}
        className="room-pulse-svg"
        preserveAspectRatio="none"
        viewBox="0 0 100 8"
        width="100%"
        height="8"
      >
        <defs>
          <linearGradient id="room-pulse-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--btn-bg)" stopOpacity="0" />
            <stop offset="20%" stopColor="var(--btn-bg)" stopOpacity="0.7" />
            <stop offset="50%" stopColor="var(--nick-color)" stopOpacity="0.9" />
            <stop offset="80%" stopColor="var(--btn-bg)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="var(--btn-bg)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d=""
          fill="none"
          stroke="url(#room-pulse-grad)"
          strokeWidth="1.4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

export default RoomPulse;