import { forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import { getAvatarColor, getInitial } from '../utils';

/*
  [2.49.0] InfoPanel — шесть глав. Добавлено «Хранилище». Обновлены
           «Голос» (видео-кружки), «Личное» (даты, авто-фильтр),
           «Ты» (refresh, избранные стикеры), «Мелочи» (сон маскота,
           dragndrop). Пасхалка: 7 тапов — «Слово».
  [2.36.2] яркий блок установки PWA, живые демо.
  [2.36.0] 5 глав, орбита-оглавление, живой маскот.
*/

const CHAPTERS = [
  { id: 'voice',    icon: '💬', label: 'Голос' },
  { id: 'personal', icon: '✉️', label: 'Личное' },
  { id: 'circle',   icon: '🤝', label: 'Круг' },
  { id: 'storage',  icon: '🗄️', label: 'Хранилище' },
  { id: 'you',      icon: '👤', label: 'Ты' },
  { id: 'small',    icon: '✨', label: 'Мелочи' },
];

const SWIPE_THRESHOLD = 90;
const SWIPE_MAX = 220;
const DIRECTION_LOCK = 10;

/* ============================================================ */
/* УСТАНОВКА PWA                                                */
/* ============================================================ */

const INSTALL_TEXTS = {
  ru: {
    title: 'Установи crew как приложение',
    sub: 'Откроется без адресной строки, во весь экран, с бейджем непрочитанного.',
    ios: 'iPhone / iPad',
    android: 'Android',
    install: 'Установить',
    collapse: 'Свернуть',
    iosSteps: [
      'Открой этот сайт в Safari.',
      'Нажми иконку «Поделиться» (квадрат со стрелкой вверх) внизу.',
      'Пролистай и выбери «На экран "Домой"».',
      'Нажми «Добавить» в правом верхнем углу.',
    ],
    androidSteps: [
      'Открой этот сайт в Chrome.',
      'Нажми три точки в правом верхнем углу.',
      'Выбери «Установить приложение» или «Добавить на главный экран».',
      'Подтверди — иконка появится на домашнем экране.',
    ],
  },
  en: {
    title: 'Install crew as an app',
    sub: 'Opens without an address bar, full-screen, with an unread badge.',
    ios: 'iPhone / iPad',
    android: 'Android',
    install: 'Install',
    collapse: 'Collapse',
    iosSteps: [
      'Open this site in Safari.',
      'Tap the Share icon (square with arrow up) at the bottom.',
      'Scroll and choose "Add to Home Screen".',
      'Tap "Add" in the top-right corner.',
    ],
    androidSteps: [
      'Open this site in Chrome.',
      'Tap the three dots in the top-right corner.',
      'Choose "Install app" or "Add to Home screen".',
      'Confirm — the icon appears on your home screen.',
    ],
  },
};

const InstallPwaBlock = () => {
  const [lang, setLang] = useState('ru');
  const [open, setOpen] = useState(null);
  const t = INSTALL_TEXTS[lang];

  return (
    <div className="info-install">
      <div className="info-install-mascot">
        <img src="/mascot.png" alt="" draggable={false} />
        <span className="info-install-mascot-halo" aria-hidden="true" />
      </div>

      <div className="info-install-head">
        <div className="info-install-title">{t.title}</div>
        <div className="info-install-langs" role="tablist">
          <button
            type="button"
            className={`info-install-lang ${lang === 'ru' ? 'info-install-lang--active' : ''}`}
            onClick={() => setLang('ru')}
            aria-label="Русский"
          >
            RU
          </button>
          <button
            type="button"
            className={`info-install-lang ${lang === 'en' ? 'info-install-lang--active' : ''}`}
            onClick={() => setLang('en')}
            aria-label="English"
          >
            EN
          </button>
        </div>
      </div>

      <div className="info-install-sub">{t.sub}</div>

      <div className="info-install-cards">
        <button
          type="button"
          className={`info-install-card ${open === 'ios' ? 'info-install-card--open' : ''}`}
          onClick={() => setOpen(open === 'ios' ? null : 'ios')}
        >
          <span className="info-install-card-icon">🍏</span>
          <span className="info-install-card-name">{t.ios}</span>
        </button>
        <button
          type="button"
          className={`info-install-card ${open === 'android' ? 'info-install-card--open' : ''}`}
          onClick={() => setOpen(open === 'android' ? null : 'android')}
        >
          <span className="info-install-card-icon">🤖</span>
          <span className="info-install-card-name">{t.android}</span>
        </button>
      </div>

      {open === 'ios' && (
        <ol className="info-install-steps">
          {t.iosSteps.map((s, i) => (
            <li key={i}>
              <span className="info-install-step-num">{i + 1}</span>
              <span className="info-install-step-text">{s}</span>
            </li>
          ))}
        </ol>
      )}

      {open === 'android' && (
        <ol className="info-install-steps">
          {t.androidSteps.map((s, i) => (
            <li key={i}>
              <span className="info-install-step-num">{i + 1}</span>
              <span className="info-install-step-text">{s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/* ============================================================ */
/* ЖИВЫЕ ДЕМО                                                  */
/* ============================================================ */

const DemoRoomPulse = () => {
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const stateRef = useRef({
    amp: 0.6, freq: 1.2, speed: 0.012,
    phase: 0, raf: null, width: 0, height: 8, running: false,
  });

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!svg || !path) return;

    const s = stateRef.current;
    const start = () => {
      if (s.running) return;
      s.running = true;
      const tick = () => {
        if (!svgRef.current || !pathRef.current) { s.running = false; return; }
        const rect = svgRef.current.getBoundingClientRect();
        s.width = rect.width;
        if (s.width <= 0) { s.raf = requestAnimationFrame(tick); return; }

        s.phase += s.speed;
        const midY = s.height / 2;
        const step = 6;
        const pointsCount = Math.ceil(s.width / step);
        let d = '';
        for (let i = 0; i <= pointsCount; i++) {
          const x = i * step;
          const t = x / s.width;
          const y = midY +
            Math.sin(t * Math.PI * 2 * s.freq + s.phase) * s.amp +
            Math.sin(t * Math.PI * 4 * s.freq + s.phase * 1.3) * (s.amp * 0.25);
          if (i === 0) d += `M ${x.toFixed(1)} ${y.toFixed(2)}`;
          else d += ` L ${x.toFixed(1)} ${y.toFixed(2)}`;
        }
        pathRef.current.setAttribute('d', d);
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    };
    start();

    return () => {
      s.running = false;
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, []);

  return (
    <div className="info-demo-live">
      <div className="info-demo-roompulse">
        <svg ref={svgRef} viewBox="0 0 100 8" preserveAspectRatio="none" width="100%" height="8">
          <defs>
            <linearGradient id="info-roompulse-grad" x1="0" y1="0" x2="1" y2="0">
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
            stroke="url(#info-roompulse-grad)"
            strokeWidth="1.4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="info-demo-caption">полоска-пульс · дышит</div>
    </div>
  );
};

const DemoReactions = () => {
  const [expanded, setExpanded] = useState(false);
  const [hit, setHit] = useState(null);

  const MAIN = ['👍', '❤️', '🔥', '😂', '😮', '😢'];
  const EXTRA = ['💀', '🎉', '🥰', '🤔', '✨', '👀', '🙈', '👏', '🤝', '🍕', '☕', '💯'];

  const handleTap = (emoji) => {
    setHit(emoji);
    setTimeout(() => setHit(null), 900);
  };

  const renderOrbit = (emojis, r, isExtra) =>
    emojis.map((e, i) => {
      const angle = (360 / emojis.length) * i - 90;
      const rad = (angle * Math.PI) / 180;
      const x = Math.cos(rad) * r;
      const y = Math.sin(rad) * r;
      return (
        <button
          key={`${isExtra ? 'x-' : ''}${e}`}
          type="button"
          className={
            `info-demo-reaction-btn` +
            (isExtra ? ' info-demo-reaction-btn--extra' : '') +
            (!isExtra && expanded ? ' info-demo-reaction-btn--dimmed' : '') +
            (hit === e ? ' info-demo-reaction-btn--hit' : '')
          }
          style={{
            left: `calc(50% + ${x}px - 16px)`,
            top: `calc(50% + ${y}px - 16px)`,
            animationDelay: `${i * 0.035}s`,
          }}
          onClick={() => handleTap(e)}
          aria-label={e}
        >
          {e}
        </button>
      );
    });

  return (
    <div className="info-demo-live">
      <div className={`info-demo-reactions-wheel ${expanded ? 'info-demo-reactions-wheel--expanded' : ''}`}>
        <button
          type="button"
          className="info-demo-reactions-center"
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Свернуть' : 'Ещё эмодзи'}
        >
          {expanded ? '−' : '＋'}
        </button>
        {renderOrbit(MAIN, 46, false)}
        {expanded && renderOrbit(EXTRA, 86, true)}
      </div>
      <div className="info-demo-caption">
        {hit
          ? `реакция ${hit}`
          : expanded
            ? 'шесть внутри · двенадцать снаружи'
            : 'тапни ＋ — раскроются все'}
      </div>
    </div>
  );
};

const DemoVoiceMessage = () => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const DURATION_MS = 3200;

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setProgress(0);
  };

  const play = () => {
    if (playing) { stop(); return; }
    setPlaying(true);
    startRef.current = Date.now();
    const tick = () => {
      const el = Date.now() - startRef.current;
      if (el >= DURATION_MS) { stop(); return; }
      setProgress(el / DURATION_MS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const bars = [0.4, 0.7, 0.3, 0.9, 0.5, 0.8, 0.2, 0.6, 0.5, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5, 0.9, 0.4, 0.6];
  const activeBars = Math.floor(progress * bars.length);

  return (
    <div className="info-demo-live">
      <div className={`voice-msg ${playing ? 'voice-msg--playing' : ''}`}>
        <button
          type="button"
          className="voice-msg-play"
          onClick={play}
          aria-label={playing ? 'Пауза' : 'Играть'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="voice-msg-wave">
          {bars.map((v, i) => (
            <span
              key={i}
              className={`voice-msg-bar ${i < activeBars ? 'voice-msg-bar--active' : ''}`}
              style={{ height: `${22 + Math.round(v * 78)}%` }}
            />
          ))}
        </div>
        <span className="voice-msg-time">
          {playing ? `0:0${Math.floor(progress * 3)}` : '0:03'}
        </span>
      </div>
      <div className="info-demo-caption">тапни — играет · тап по волне — перемотка</div>
    </div>
  );
};

const DemoVideoCircle = () => {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

  const toggle = () => setPlaying(p => !p);
  const toggleMute = (e) => { e.stopPropagation(); setMuted(m => !m); };

  return (
    <div className="info-demo-live">
      <div className="info-video-demo">
        <div className="info-video-demo-square" onClick={toggle}>
          <div className="info-video-demo-ph">
            <div className="info-video-demo-mascot" />
          </div>

          {!playing && (
            <span className="info-video-demo-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          )}

          <div className="info-video-demo-controls">
            <button
              type="button"
              className="info-video-demo-btn"
              onClick={toggleMute}
              aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            >
              {muted ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H3v6h3l5 4V5z" />
                  <line x1="22" y1="9" x2="16" y2="15" />
                  <line x1="16" y1="9" x2="22" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H3v6h3l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="info-video-demo-btn"
              onClick={(e) => e.stopPropagation()}
              aria-label="На весь экран"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>

          <span className="info-video-demo-badge">0:07</span>
        </div>
      </div>
      <div className="info-demo-caption">
        {playing ? 'кружок играет сам · без звука' : 'пауза — тапни'}
      </div>
    </div>
  );
};

const DemoDialogCard = () => {
  return (
    <div className="info-demo-live">
      <div className="dialog-card-wrap info-demo-dialog-card">
        <div className="dialog-card">
          <div className="dialog-avatar-wrap">
            <div
              className="dialog-avatar dialog-avatar--unread"
              style={{ background: getAvatarColor('Кря') }}
            >
              К
            </div>
            <span className="dialog-online-dot" aria-hidden="true" />
            <span className="dialog-unread-pulse" aria-hidden="true" />
          </div>
          <div className="dialog-body">
            <div className="dialog-top">
              <span className="dialog-nick">Кря</span>
              <span className="dialog-time">сейчас</span>
            </div>
            <div className="dialog-bottom">
              <span className="dialog-preview">🎤 голосовое</span>
              <span className="dialog-badge">3</span>
            </div>
          </div>
        </div>
      </div>
      <div className="info-demo-caption">карточка диалога · живая</div>
    </div>
  );
};

const DemoSearch = () => {
  const [q, setQ] = useState('');
  const sample = 'найду тебя в любом диалоге';
  const qLower = q.trim().toLowerCase();
  const isHit = qLower.length > 0 && sample.toLowerCase().includes(qLower);

  return (
    <div className="info-demo-live">
      <div className="info-demo-search-wrap">
        <input
          className="info-demo-search-input"
          type="text"
          placeholder="Поиск..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && <span className="info-demo-search-count">{isHit ? '1' : '0'}</span>}
      </div>
      <div className={`info-demo-search-msg ${isHit ? 'info-demo-search-msg--hit' : ''}`}>
        {sample}
      </div>
      <div className="info-demo-caption">
        {q ? (isHit ? 'найдено — пульсирует' : 'ничего') : 'попробуй поиск'}
      </div>
    </div>
  );
};

const DemoDates = () => (
  <div className="info-demo-live">
    <div className="info-dates-list">
      <div className="info-date-row">
        <span className="info-date-value">сегодня в 19:42</span>
        <span className="info-date-hint">только что</span>
      </div>
      <div className="info-date-row">
        <span className="info-date-value">вчера в 19:42</span>
        <span className="info-date-hint">один день</span>
      </div>
      <div className="info-date-row">
        <span className="info-date-value">19:42 21 сентября</span>
        <span className="info-date-hint">этот год</span>
      </div>
      <div className="info-date-row">
        <span className="info-date-value">19:42 21 сентября 2025</span>
        <span className="info-date-hint">прошлый год</span>
      </div>
    </div>
    <div className="info-demo-caption">год — только если он не текущий</div>
  </div>
);

const DemoFriendshipRitual = () => {
  return (
    <div className="info-demo-live">
      <div className="info-demo-fr-stage">
        <div className="info-demo-fr-orb info-demo-fr-orb--fire">
          <span>К</span>
        </div>
        <svg className="info-demo-fr-thread" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="info-fr-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#FF7A45" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#3BB5E8" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path
            d="M 20 30 C 80 5, 160 55, 220 30"
            fill="none"
            stroke="url(#info-fr-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            className="info-demo-fr-thread-path"
          />
        </svg>
        <div className="info-demo-fr-orb info-demo-fr-orb--water">
          <span>A</span>
        </div>
      </div>
      <div className="info-demo-caption">огонь · вода · нить</div>
    </div>
  );
};

/* [2.49.0] Демо хранилища — карточка с drag-подсказкой */

const DemoStorageCard = () => {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setDragging(d => !d);
    }, 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="info-demo-live">
      <div className="info-storage-demo">
        <div className={`info-storage-tile ${dragging ? 'info-storage-tile--drag' : ''}`}>
          <div className="info-storage-tile-media">
            <div className="info-storage-tile-mascot" />
          </div>
          <div className="info-storage-tile-meta">
            <span className="info-storage-tile-type">🎤</span>
            <span className="info-storage-tile-nick">
              <span className="info-storage-tile-avatar" style={{ background: getAvatarColor('admin') }}>A</span>
              admin
            </span>
          </div>
        </div>
        <div className="info-storage-tile info-storage-tile--ghost">
          <div className="info-storage-tile-media">
            <div className="info-storage-tile-mascot" />
          </div>
          <div className="info-storage-tile-meta">
            <span className="info-storage-tile-type">🎤</span>
            <span className="info-storage-tile-nick">
              <span className="info-storage-tile-avatar" style={{ background: getAvatarColor('admin') }}>A</span>
              admin
            </span>
          </div>
        </div>
      </div>
      <div className="info-demo-caption">
        {dragging ? 'удерживай · соседи расступаются' : 'перетаскивание — как у себя'}
      </div>
    </div>
  );
};

const DemoThemeSwitcher = () => {
  const [dark, setDark] = useState(false);
  return (
    <div className="info-demo-live">
      <button
        type="button"
        className={`info-demo-theme-scene ${dark ? 'info-demo-theme-scene--dark' : ''}`}
        onClick={() => setDark(v => !v)}
        aria-label="Переключить тему"
      >
        <span className="info-demo-theme-icon">{dark ? '🌙' : '☀️'}</span>
        <span className="info-demo-theme-hint">{dark ? 'тёмная' : 'светлая'}</span>
      </button>
      <div className="info-demo-caption">тапни — растекается кругом</div>
    </div>
  );
};

const DemoMascotRadio = () => {
  const [playing, setPlaying] = useState(true);
  return (
    <div className="info-demo-live">
      <button
        type="button"
        className="info-demo-radio"
        onClick={() => setPlaying(v => !v)}
        aria-label={playing ? 'Пауза' : 'Играть'}
      >
        <span className={`info-demo-radio-mascot ${playing ? 'info-demo-radio-mascot--playing' : ''}`}>
          <img src="/mascot.png" alt="" draggable={false} />
        </span>
        {playing && (
          <span className="info-demo-radio-eq" aria-hidden="true">
            <span /><span /><span /><span />
          </span>
        )}
      </button>
      <div className="info-demo-caption">{playing ? '♪ трек играет' : 'пауза'}</div>
    </div>
  );
};

const DemoCapsule = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="info-demo-live info-demo-live--capsule">
      <div
        className={`info-demo-capsule ${open ? 'info-demo-capsule--open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {!open && <span className="info-demo-capsule-arrow">▲</span>}
        {open && (
          <div className="info-demo-capsule-content">
            <span className="info-demo-capsule-btn">👥</span>
            <span className="info-demo-capsule-btn">✏️</span>
          </div>
        )}
      </div>
      <div className="info-demo-caption">
        {open ? 'развёрнута' : 'тапни — раскроется'}
      </div>
    </div>
  );
};

/* [2.49.0] Демо: маскот засыпает, если долго молчишь */

const DemoMascotSleep = () => {
  const [asleep, setAsleep] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setAsleep(a => !a);
    }, 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="info-demo-live">
      <div className="info-sleep-demo">
        <div className={`info-sleep-mascot ${asleep ? 'info-sleep-mascot--sleep' : ''}`}>
          <img src="/mascot.png" alt="" draggable={false} />
          {asleep && (
            <span className="info-sleep-zzz" aria-hidden="true">
              <span>z</span><span>z</span><span>z</span>
            </span>
          )}
        </div>
      </div>
      <div className="info-demo-caption">
        {asleep ? 'дремлет · ждёт тебя' : 'бодрый · при деле'}
      </div>
    </div>
  );
};

/* [2.49.0] Демо: избранные стикеры */

const DemoFavoriteSticker = () => {
  const [fav, setFav] = useState(true);

  return (
    <div className="info-demo-live">
      <button
        type="button"
        className={`info-fav-demo ${fav ? 'info-fav-demo--active' : ''}`}
        onClick={() => setFav(v => !v)}
      >
        <span className="info-fav-demo-img" aria-hidden="true">
          <img src="/mascot.png" alt="" draggable={false} />
        </span>
        <span className="info-fav-demo-star" aria-hidden="true">⭐</span>
      </button>
      <div className="info-demo-caption">
        {fav ? 'в избранных · удержание снимает' : 'тапни — добавить в избранные'}
      </div>
    </div>
  );
};

/* ============================================================ */
/* InfoPanel                                                    */
/* ============================================================ */

const InfoPanel = forwardRef(({
  onClose,
  onMessageAdmin,
  blockedUsers = [],
  onUnblockUser,
  version = '—',
}, ref) => {
  const [activeChapter, setActiveChapter] = useState('voice');
  const [easterTaps, setEasterTaps] = useState(0);
  const [easterOpen, setEasterOpen] = useState(false);

  const panelRef = useRef(null);
  const scrollRef = useRef(null);

  const voiceRef = useRef(null);
  const personalRef = useRef(null);
  const circleRef = useRef(null);
  const storageRef = useRef(null);
  const youRef = useRef(null);
  const smallRef = useRef(null);

  const sectionRefs = {
    voice: voiceRef,
    personal: personalRef,
    circle: circleRef,
    storage: storageRef,
    you: youRef,
    small: smallRef,
  };

  const swipeRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    dir: null,
    lastDx: 0,
  });

  useEffect(() => {
    if (typeof ref === 'function') ref(panelRef.current);
    else if (ref) ref.current = panelRef.current;
  }, [ref]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let rafId = null;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const top = el.scrollTop + 120;
        let cur = 'voice';
        for (const c of CHAPTERS) {
          const r = sectionRefs[c.id].current;
          if (r && r.offsetTop <= top) cur = c.id;
        }
        setActiveChapter(cur);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToChapter = useCallback((id) => {
    const el = sectionRefs[id]?.current;
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
    setActiveChapter(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const s = swipeRef.current;
    s.active = true;
    s.startX = t.clientX;
    s.startY = t.clientY;
    s.dir = null;
    s.lastDx = 0;
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };

  const handleTouchMove = (e) => {
    const s = swipeRef.current;
    if (!s.active) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;

    if (!s.dir) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (s.dir === 'v') return;

    const off = Math.max(0, Math.min(dx, SWIPE_MAX));
    s.lastDx = off;
    if (panelRef.current) {
      panelRef.current.style.transform = `translateX(${off}px)`;
      panelRef.current.style.opacity = String(Math.max(0.35, 1 - off / 400));
    }
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = () => {
    const s = swipeRef.current;
    if (!s.active) return;
    s.active = false;

    if (s.dir === 'h' && s.lastDx > SWIPE_THRESHOLD) {
      onClose();
      return;
    }
    if (panelRef.current) {
      panelRef.current.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.24s';
      panelRef.current.style.transform = '';
      panelRef.current.style.opacity = '1';
      setTimeout(() => {
        if (panelRef.current) panelRef.current.style.transition = '';
      }, 260);
    }
    s.dir = null;
    s.lastDx = 0;
  };

  // [2.49.0] Пасхалка: 7 тапов вместо 5. Ритм задан ритуалом.
  const handleMascotTap = () => {
    const next = easterTaps + 1;
    if (next >= 7) {
      setEasterOpen(true);
      setEasterTaps(0);
    } else {
      setEasterTaps(next);
      setTimeout(() => setEasterTaps(0), 1400);
    }
  };

  return (
    <>
      <div className="info-overlay" onClick={onClose} />
      <aside
        className="info-panel"
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <header className="info-header">
          <div className="info-brand">
            <button
              type="button"
              className="info-brand-mascot"
              onClick={handleMascotTap}
              aria-label="Маскот"
            >
              <img src="/mascot.png" alt="" draggable={false} />
              <span className="info-brand-mascot-halo" aria-hidden="true" />
            </button>
            <div className="info-brand-text">
              <h2 className="info-brand-title">banjoboy's crew</h2>
              <div className="info-brand-subtitle">v{version} · живой</div>
            </div>
          </div>
          <button
            className="info-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>

        <div className="info-body" ref={scrollRef}>

          <InstallPwaBlock />

          <p className="info-intro">
            Это не список. Это короткий разговор о том, как устроен crew.
            Шесть глав. Прочитаешь — поймёшь всё.
          </p>

          <nav className="info-orbit info-orbit--sticky" aria-label="Оглавление">
            {CHAPTERS.map(c => (
              <button
                key={c.id}
                type="button"
                className={`info-orbit-btn ${activeChapter === c.id ? 'info-orbit-btn--active' : ''}`}
                onClick={() => scrollToChapter(c.id)}
                aria-label={c.label}
                title={c.label}
              >
                <span className="info-orbit-icon">{c.icon}</span>
                <span className="info-orbit-label">{c.label}</span>
              </button>
            ))}
          </nav>

          {/* ===== 1. ГОЛОС ===== */}
          <section ref={voiceRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">01</span>
              <h3 className="info-chapter-title">Голос</h3>
            </div>
            <p className="info-chapter-lede">
              Общий чат. Здесь говорят все — кто онлайн, тот и слышен.
            </p>

            <div className="info-block">
              <div className="info-block-title">Тишина и дыхание</div>
              <p>
                Под шапкой — тонкая полоска. Она ничего не измеряет.
                Просто дышит вместе с теми, кто сейчас в комнате.
              </p>
              <DemoRoomPulse />
            </div>

            <div className="info-block">
              <div className="info-block-title">Реакции</div>
              <p>
                Тап по сообщению — из точки тапа расцветает колесо.
                Шесть главных эмодзи — на внутренней орбите:
                👍 ❤️ 🔥 😂 😮 😢.
              </p>
              <p>
                В центре — ＋. Тапни — раскроются двенадцать свежих:
                💀 🎉 🥰 🤔 ✨ 👀 🙈 👏 🤝 🍕 ☕ 💯.
              </p>
              <DemoReactions />
            </div>

            <div className="info-block">
              <div className="info-block-title">Голосовое</div>
              <p>
                Зажми кнопку отправки на пустом поле — запись начнётся.
                Тапни маскота — пауза. Потяни вверх — отправить, вниз — отменить.
              </p>
              <DemoVoiceMessage />
            </div>

            <div className="info-block">
              <div className="info-block-title">Кружок</div>
              <p>
                Свайп вверх по кнопке камеры — запись видео-кружка.
                Отправленный — играет сам, без звука. В полноэкранном
                режиме — mute слева, реакции снизу, ✕ в углу.
              </p>
              <DemoVideoCircle />
            </div>
          </section>

          {/* ===== 2. ЛИЧНОЕ ===== */}
          <section ref={personalRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">02</span>
              <h3 className="info-chapter-title">Личное</h3>
            </div>
            <p className="info-chapter-lede">
              Один на один. Никто не подслушивает.
            </p>

            <div className="info-block">
              <div className="info-block-title">Диалоги</div>
              <p>
                Свайп от правого края — там все, с кем ты говорил лично.
                У непрочитанного — счётчик и подсветка.
              </p>
              <DemoDialogCard />
            </div>

            <div className="info-block">
              <div className="info-block-title">Поиск</div>
              <p>
                Строка сверху. Ищешь по тексту — совпадения пульсируют голубым.
              </p>
              <DemoSearch />
            </div>

            <div className="info-block">
              <div className="info-block-title">Даты</div>
              <p>
                Время — число — месяц. Год показываем, только если он
                не текущий. Сегодня, вчера, позавчера — с префиксом.
              </p>
              <DemoDates />
            </div>

            <div className="info-block">
              <div className="info-block-title">Фильтр по дате</div>
              <p>
                Внутри диалога — четыре чипа: «Всё», «Сегодня», «7 дней»,
                «30 дней». При открытии сам подбирает удобный: если
                последнее сообщение сегодня — покажет «Сегодня».
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Своё</div>
              <p>
                Своё можно убрать — долгий тап, потом 🗑️.
                Уйдёт у обоих. Чужое — не тронешь.
              </p>
            </div>
          </section>

          {/* ===== 3. КРУГ ===== */}
          <section ref={circleRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">03</span>
              <h3 className="info-chapter-title">Круг</h3>
            </div>
            <p className="info-chapter-lede">
              Те, кто рядом. Друзья, дуэли, блокировки.
            </p>

            <div className="info-block">
              <div className="info-block-title">Ритуал дружбы</div>
              <p>
                Огонь слева, вода справа. Между ними нить.
                Принять — нить стягивается. Отклонить — гаснет.
              </p>
              <DemoFriendshipRitual />
            </div>

            <div className="info-block">
              <div className="info-block-title">Дуэли</div>
              <p>
                Камень, ножницы, бумага. Проиграл — минута бана в общий чат.
                Счёт побед копится в профиле.
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Блокировка</div>
              <p>
                Заблокированный исчезает из онлайна и из твоих диалогов.
                Разблокировать — в самом конце этой панели.
              </p>
            </div>
          </section>

          {/* ===== 4. ХРАНИЛИЩЕ ===== */}
          <section ref={storageRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">04</span>
              <h3 className="info-chapter-title">Хранилище</h3>
            </div>
            <p className="info-chapter-lede">
              Твоё. Приватное. Только ты видишь.
            </p>

            <div className="info-block">
              <div className="info-block-title">Что это</div>
              <p>
                Личная коллекция контента из чата. Сохраняешь любое сообщение —
                текст, фото, гифку, голосовое, кружок. Даже если оригинал
                удалят, копия останется у тебя.
              </p>
              <p>
                Открывается из профиля — кнопка <b>🗄️ Моё хранилище</b>.
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Как сохранить</div>
              <p>
                Долгое нажатие на сообщение в ленте → пункт{' '}
                <b>🗄️ В хранилище</b>. Если сообщение уже сохранено,
                пункт станет <b>✓ Уже в хранилище</b>.
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Порядок</div>
              <p>
                Внутри — сетка карточек. Долгое нажатие и перетаскивание —
                меняешь местами. Соседи расступаются. Отпустил — порядок
                сохранён. Работает только в полном списке, без фильтров.
              </p>
              <DemoStorageCard />
            </div>

            <div className="info-block">
              <div className="info-block-title">Мягко</div>
              <p>
                Удаление — через confirm. Лимит — 500 записей.
                Фильтр по типу и поиск по тексту внутри.
              </p>
            </div>
          </section>

          {/* ===== 5. ТЫ ===== */}
          <section ref={youRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">05</span>
              <h3 className="info-chapter-title">Ты</h3>
            </div>
            <p className="info-chapter-lede">
              Как ты выглядишь и как звучишь.
            </p>

            <div className="info-block">
              <div className="info-block-title">Профиль</div>
              <p>
                Зажми себя в панели игроков — там пункт «Профиль».
                Аватарка, пара слов о себе, оформление: 8 шрифтов, цвет, поворот.
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Темы</div>
              <p>
                Светлая и тёмная. Новая тема растекается кругом из точки тапа.
              </p>
              <DemoThemeSwitcher />
            </div>

            <div className="info-block">
              <div className="info-block-title">Обновление страницы</div>
              <p>
                Кнопка с круговыми стрелками. Слева-сверху на десктопе,
                в шапке слева — на телефоне. Один тап — стрелки крутятся,
                страница обновляется. Видна только на главном экране,
                в панелях не мешает.
              </p>
            </div>

            <div className="info-block">
              <div className="info-block-title">Избранные стикеры</div>
              <p>
                Долгое нажатие на гифку в панели — 500мс добавит
                в избранные, 1000мс на избранной — уберёт.
                В ленте — через меню действий.
              </p>
              <DemoFavoriteSticker />
            </div>

            <div className="info-block">
              <div className="info-block-title">Радио</div>
              <p>
                Маскот в шапке — это радио. Три трека по кругу.
                Короткий тап — пауза, долгий — следующий, свайп — громкость.
              </p>
              <DemoMascotRadio />
            </div>

            <div className="info-block">
              <div className="info-block-title">Уведомления</div>
              <p>
                На iPhone — сначала установи на домашний экран, потом разреши.
                На Android — просто разреши в браузере.
              </p>
            </div>
          </section>

          {/* ===== 6. МЕЛОЧИ ===== */}
          <section ref={smallRef} className="info-chapter">
            <div className="info-chapter-head">
              <span className="info-chapter-num">06</span>
              <h3 className="info-chapter-title">Мелочи</h3>
            </div>
            <p className="info-chapter-lede">
              Жесты и движение. Всё, что делает crew — живым.
            </p>

            <div className="info-block">
              <div className="info-block-title">Маскот</div>
              <p>
                Он умеет больше, чем кажется. Дремлет, если ты молчишь.
                Летает из шапки в панель. Возвращается. Крутится на орбите,
                когда приходят личные. Следи за ним — он живой.
              </p>
              <DemoMascotSleep />
            </div>

            <div className="info-block">
              <div className="info-block-title">Капсула</div>
              <p>
                Внизу на телефоне — розовая полоска.
                Внутри — пользователи и написать.
              </p>
              <DemoCapsule />
            </div>

            <div className="info-block">
              <div className="info-block-title">Свайпы</div>
              <ul className="info-list">
                <li>Слева от края — панель пользователей.</li>
                <li>Справа от края — диалоги.</li>
                <li>Влево по сообщению — ответ.</li>
                <li>Вправо по своему — удалить.</li>
                <li>Вниз по фото — закрыть.</li>
                <li>Вниз по видео в fullscreen — закрыть.</li>
                <li>Вверх по капсуле — открыть меню.</li>
              </ul>
            </div>
          </section>

          {/* ===== ЗАБЛОКИРОВАННЫЕ ===== */}
          <section className="info-chapter info-chapter--outro">
            <div className="info-chapter-head">
              <span className="info-chapter-num">✦</span>
              <h3 className="info-chapter-title">Заблокированные</h3>
            </div>
            {blockedUsers.length === 0 ? (
              <p className="info-blocks-empty">Пока никого. Хорошо живёшь.</p>
            ) : (
              <ul className="info-blocks-list">
                {blockedUsers.map(u => (
                  <li key={u.userId} className="info-block-item">
                    <div
                      className="info-block-avatar"
                      style={u.avatarUrl
                        ? { backgroundImage: `url(${u.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: getAvatarColor(u.nickname) }
                      }
                    >
                      {!u.avatarUrl && getInitial(u.nickname)}
                    </div>
                    <span className="info-block-nick">{u.nickname}</span>
                    <button
                      type="button"
                      className="info-block-unblock"
                      onClick={() => onUnblockUser && onUnblockUser(u.userId)}
                      title="Разблокировать"
                    >
                      Вернуть
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ===== OUTRO ===== */}
          <section className="info-chapter info-chapter--end">
            <p className="info-end-line">
              Этот чат сделан братом и его Дзенами.
            </p>
            <p className="info-end-line info-end-line--muted">
              Ты — часть этого. Иначе бы не читал.
            </p>
            {onMessageAdmin && (
              <button
                type="button"
                className="info-admin-btn"
                onClick={onMessageAdmin}
              >
                ✉️ Написать админу
              </button>
            )}
          </section>

        </div>

        {easterOpen && (
          <div className="info-easter" onClick={() => setEasterOpen(false)}>
            <div className="info-easter-inner" onClick={(e) => e.stopPropagation()}>
              <div className="info-easter-mascot">
                <img src="/mascot.png" alt="" draggable={false} />
              </div>
              <p className="info-easter-text">
                Слово десятого
              </p>
              <p className="info-easter-sub">
                Слово — не награда за финал. Это след. Миг проходит тихо,
                если его не записать. Сделай так, чтобы было что прочитать.
              </p>
              <button
                type="button"
                className="info-easter-close"
                onClick={() => setEasterOpen(false)}
              >
                Я здесь
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
});

InfoPanel.displayName = 'InfoPanel';

export default InfoPanel;