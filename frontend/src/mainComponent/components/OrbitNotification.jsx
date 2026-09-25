import { useEffect, useRef } from 'react';
import { getAvatarColor, getInitial } from '../utils';
import Avatar from './Avatar';

/*
  [2.48.13] Кэш nodes + кэш ORBITS на длину. Раньше querySelectorAll
            и .length вызывались на каждом кадре — парсинг селектора,
            скан DOM. Теперь — один раз при изменении users.length.
  [2.39.4] mascotRef, mascotOnly.
  [2.35.34] Кнопка вместо div.
*/
const MAX_AVATARS = 5;
const MOVE_CANCEL_PX = 12;

const ORBITS = [
  { rx: 96,  ry: 42, speed: 0.72,  tilt: -10, phase: 0.15 },
  { rx: 114, ry: 52, speed: -0.52, tilt: 14,  phase: 2.10 },
  { rx: 84,  ry: 36, speed: 0.90,  tilt: -4,  phase: 4.20 },
  { rx: 108, ry: 48, speed: -0.64, tilt: 8,   phase: 1.00 },
  { rx: 100, ry: 44, speed: 0.78,  tilt: -14, phase: 3.30 },
];

const prevent = (e) => e.preventDefault();

const OrbitNotification = ({
  users = [],
  onClick,
  className = '',
  mascotRef = null,
  mascotOnly = false,
  paused = false,
}) => {
  const orbitRef = useRef(null);
  const rafRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0, fired: false });

  const usersCount = users.length;

  useEffect(() => {
    if (mascotOnly || paused) return;
    const stage = orbitRef.current;
    if (!stage) return;

    // Кэш слотов — один раз. querySelectorAll на каждом кадре — главный
    // источник тормозов: парсит селектор, сканирует DOM, инвалидирует layout.
    const nodes = stage.querySelectorAll('.pm-orbit-slot');
    const n = nodes.length;
    if (n === 0) return;

    // Кэш параметров для каждого слота — не пересчитываем массив каждый кадр.
    const params = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = ORBITS[i % ORBITS.length];
      const rad = (o.tilt * Math.PI) / 180;
      params[i] = {
        rx: o.rx,
        ry: o.ry,
        speed: o.speed,
        phase: o.phase,
        cosT: Math.cos(rad),
        sinT: Math.sin(rad),
      };
    }

    const start = performance.now();

    const tick = (time) => {
      const t = (time - start) / 1000;

      for (let i = 0; i < n; i++) {
        const p = params[i];
        const a = p.phase + p.speed * t;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);

        const rawX = cosA * p.rx;
        const rawY = sinA * p.ry;

        const x = rawX * p.cosT - rawY * p.sinT;
        const y = rawX * p.sinT + rawY * p.cosT;

        const depth = (sinA + 1) / 2;
        const scale = 0.6 + depth * 0.5;
        const opacity = 0.42 + depth * 0.58;

        const el = nodes[i];
        el.style.transform =
          `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(2)})`;
        el.style.opacity = opacity.toFixed(2);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mascotOnly, paused, usersCount]);

  const shown = mascotOnly ? [] : users.slice(0, MAX_AVATARS);
  const more = mascotOnly ? 0 : Math.max(0, users.length - MAX_AVATARS);
  const hasOrbit = shown.length > 0;

  const handlePointerDown = (e) => {
    if (!onClick) return;
    e.stopPropagation();
    e.preventDefault();
    startPosRef.current = { x: e.clientX, y: e.clientY, fired: true };
    onClick();
  };

  const handlePointerMove = (e) => {
    if (!startPosRef.current.fired) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      startPosRef.current.fired = false;
    }
  };

  const handlePointerUp = () => {
    startPosRef.current.fired = false;
  };

  const classes = [
    'pm-orbit',
    className,
    mascotOnly || !hasOrbit ? 'pm-orbit--mascot-only' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={prevent}
      onDragStart={prevent}
      aria-label="Новые личные сообщения"
    >
      {hasOrbit && (
        <>
          <span className="pm-orbit-halo pm-orbit-halo--outer" aria-hidden="true" />
          <span className="pm-orbit-halo pm-orbit-halo--inner" aria-hidden="true" />
        </>
      )}

      <span
        ref={mascotRef}
        className="pm-orbit-mascot-wrap"
        aria-hidden="true"
      >
        <span className="pm-orbit-mascot" />
      </span>

      {hasOrbit && (
        <span className="pm-orbit-stage" ref={orbitRef} aria-hidden="true">
          {shown.map((u, i) => (
            <span
              key={u.userId}
              className="pm-orbit-slot"
              style={{ animationDelay: `${0.06 + i * 0.12}s` }}
            >
              <Avatar
                src={u.avatarUrl}
                nickname={u.nickname || '?'}
                className="pm-orbit-avatar"
                alt=""
              />
            </span>
          ))}
        </span>
      )}

      {more > 0 && (
        <span className="pm-orbit-more">+{more}</span>
      )}
    </button>
  );
};

export default OrbitNotification;