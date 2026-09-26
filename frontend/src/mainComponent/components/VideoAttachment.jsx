import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactionWheel from './ReactionWheel';

/*
  [2.50.6] Fullscreen видео-файла — свои контролы, без нативных.
           Кнопка mute слева, реакция 😀 справа, реакции сверху.
           Как в VideoMessage. Свайп вниз — закрыть.
  [2.50.2] Видео-файл. Прямоугольник по aspect ratio видео. Без границ,
           без обводок — как image-only. Тап — play/pause, кнопки mute
           и fullscreen в углу. Автоплей не делаем — только по тапу.
*/

let currentlyPlayingAttachment = null;

const SWIPE_CLOSE_PX = 90;
const WHEEL_NEED_PX = 136;

const Icon = {
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Mute: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  ),
  Sound: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  Fullscreen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
};

const VideoAttachment = ({
  url,
  isOwn = false,
  messageId = null,
  reactions = null,
  nickname = null,
  onReact = null,
}) => {
  const videoRef = useRef(null);
  const fsRef = useRef(null);
  const fsOverlayRef = useRef(null);
  const fsStageRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fsOpen, setFsOpen] = useState(false);
  const [fsPlaying, setFsPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const [fsWheel, setFsWheel] = useState(null);
  const [fsReactionListEmoji, setFsReactionListEmoji] = useState(null);

  const fsGestureRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    direction: null,
  });

  const canReact = !!onReact && !!messageId && !!nickname;
  const reactionEntries = reactions ? Object.entries(reactions) : [];
  const hasReactions = reactionEntries.length > 0;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMeta = () => {
      setReady(true);
      try {
        if (v.currentTime < 0.01) v.currentTime = 0.001;
      } catch { /* noop */ }
    };
    if (v.readyState >= 1) onLoadedMeta();
    else v.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
    return () => v.removeEventListener('loadedmetadata', onLoadedMeta);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (!v) return;
      try { v.pause(); } catch { /* noop */ }
      if (currentlyPlayingAttachment === v) currentlyPlayingAttachment = null;
    };
  }, []);

  // Пауза мелкого видео при открытии fullscreen
  useEffect(() => {
    const v = videoRef.current;
    if (v && fsOpen) {
      try { v.pause(); } catch { /* noop */ }
      setPlaying(false);
    }
  }, [fsOpen]);

  useEffect(() => {
    if (!fsOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setFsOpen(false);
        setFsWheel(null);
        setFsReactionListEmoji(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fsOpen]);

  const toggle = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      try { v.pause(); } catch { /* noop */ }
      setPlaying(false);
      if (currentlyPlayingAttachment === v) currentlyPlayingAttachment = null;
    } else {
      if (currentlyPlayingAttachment && currentlyPlayingAttachment !== v) {
        try { currentlyPlayingAttachment.pause(); } catch { /* noop */ }
      }
      currentlyPlayingAttachment = v;
      v.play().then(() => setPlaying(true)).catch(() => { /* noop */ });
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    const fv = fsRef.current;
    if (fv) fv.muted = next;
  };

  const openFs = (e) => { e.stopPropagation(); setFsOpen(true); };
  const closeFs = (e) => {
    if (e) e.stopPropagation();
    setFsOpen(false);
    setFsWheel(null);
    setFsReactionListEmoji(null);
  };

  const handleFsPlayToggle = (e) => {
    e.stopPropagation();
    const v = fsRef.current;
    if (!v) return;
    if (fsPlaying) { v.pause(); setFsPlaying(false); }
    else { v.play().then(() => setFsPlaying(true)).catch(() => { /* noop */ }); }
  };

  // Свайп вниз — закрыть
  const onOverlayTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    fsGestureRef.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      lastY: t.clientY,
      direction: null,
    };
  };

  const onOverlayTouchMove = (e) => {
    const g = fsGestureRef.current;
    if (!g.active) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    g.lastY = t.clientY;

    if (!g.direction) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.direction = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    }
    if (g.direction !== 'v') return;
    if (e.cancelable) e.preventDefault();

    if (dy > 0) {
      const el = fsOverlayRef.current;
      const stage = fsStageRef.current;
      const p = Math.min(1, dy / 320);
      if (el) el.style.background = `rgba(10, 10, 10, ${0.95 - p * 0.6})`;
      if (stage) {
        stage.style.transition = 'none';
        stage.style.transform = `translateY(${dy}px) scale(${1 - p * 0.08})`;
        stage.style.opacity = String(1 - p * 0.4);
      }
    }
  };

  const onOverlayTouchEnd = () => {
    const g = fsGestureRef.current;
    if (!g.active) return;
    const dy = g.lastY - g.startY;
    g.active = false;

    if (g.direction === 'v' && dy > SWIPE_CLOSE_PX) {
      closeFs();
      return;
    }

    const el = fsOverlayRef.current;
    const stage = fsStageRef.current;
    if (el) { el.style.transition = 'background 0.24s'; el.style.background = ''; }
    if (stage) {
      stage.style.transition = 'transform 0.24s cubic-bezier(0.25,1,0.5,1), opacity 0.24s';
      stage.style.transform = '';
      stage.style.opacity = '1';
      setTimeout(() => {
        if (stage) stage.style.transition = '';
        if (el) el.style.transition = '';
      }, 260);
    }
    g.direction = null;
  };

  const handleToggleWheel = (e) => {
    e.stopPropagation();
    if (fsWheel) { setFsWheel(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = Math.max(WHEEL_NEED_PX, Math.min(window.innerWidth - WHEEL_NEED_PX, cx));
    const y = Math.max(WHEEL_NEED_PX, Math.min(window.innerHeight - WHEEL_NEED_PX, cy));
    setFsWheel({ x, y });
  };

  const handlePick = (emoji) => {
    if (onReact && messageId) onReact(messageId, emoji);
    setFsWheel(null);
  };

  return (
    <>
      <div className={`video-attachment ${isOwn ? 'video-attachment--own' : ''}`}>
        <div
          className="video-attachment-frame"
          onClick={toggle}
        >
          <video
            ref={videoRef}
            src={url}
            className="video-attachment-el"
            playsInline
            preload="metadata"
            muted={muted}
          />

          {!ready && <div className="video-attachment-ph" aria-hidden="true" />}

          {!playing && ready && (
            <span className="video-attachment-play" aria-hidden="true">
              <Icon.Play />
            </span>
          )}

          <div className="video-attachment-controls">
            <button
              type="button"
              className="video-attachment-btn"
              onClick={toggleMute}
              aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            >
              {muted ? <Icon.Mute /> : <Icon.Sound />}
            </button>
            <button
              type="button"
              className="video-attachment-btn"
              onClick={openFs}
              aria-label="На весь экран"
            >
              <Icon.Fullscreen />
            </button>
          </div>
        </div>
      </div>

      {fsOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fullscreen-overlay"
          ref={fsOverlayRef}
          onClick={closeFs}
          onTouchStart={onOverlayTouchStart}
          onTouchMove={onOverlayTouchMove}
          onTouchEnd={onOverlayTouchEnd}
          onTouchCancel={onOverlayTouchEnd}
        >
          <div className="fs-topbar" onClick={(e) => e.stopPropagation()}>
            <div className="fs-author" />
            <button
              type="button"
              className="fs-close"
              onClick={closeFs}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          <div className="fs-stage" ref={fsStageRef} onClick={closeFs}>
            <video
              ref={fsRef}
              src={url}
              className="fs-image"
              playsInline
              muted={muted}
              onClick={handleFsPlayToggle}
              onPlay={() => setFsPlaying(true)}
              onPause={() => setFsPlaying(false)}
              onEnded={() => setFsPlaying(false)}
            />

            {!fsPlaying && (
              <button
                type="button"
                className="fs-video-play"
                onClick={handleFsPlayToggle}
                aria-label="Воспроизвести"
              >
                <Icon.Play />
              </button>
            )}
          </div>

          <div className="fs-bottombar fs-video-bottombar" onClick={(e) => e.stopPropagation()}>
            {hasReactions && (
              <div className="fs-reactions-strip">
                {reactionEntries.map(([emoji, users]) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`fs-reaction-badge ${users.includes(nickname) ? 'own' : ''}`}
                    onClick={() => setFsReactionListEmoji(prev => prev === emoji ? null : emoji)}
                  >
                    <span className="fs-reaction-badge-emoji">{emoji}</span>
                    <span className="fs-reaction-badge-count">{users.length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="fs-video-bottombar-actions">
              <button
                type="button"
                className="fs-reaction-toggle"
                onClick={toggleMute}
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
              >
                {muted ? <Icon.Mute /> : <Icon.Sound />}
              </button>
              {canReact && (
                <button
                  type="button"
                  className={`fs-reaction-toggle fs-reaction-toggle--react ${fsWheel ? 'active' : ''}`}
                  onClick={handleToggleWheel}
                  aria-label="Реакции"
                >
                  😀
                </button>
              )}
            </div>
          </div>

          {fsReactionListEmoji && reactions?.[fsReactionListEmoji] && (
            <div className="fs-reaction-list" onClick={(e) => e.stopPropagation()}>
              <div className="fs-reaction-list-header">
                <span className="fs-reaction-list-emoji">{fsReactionListEmoji}</span>
                <span className="fs-reaction-list-count">
                  {reactions[fsReactionListEmoji].length}
                </span>
              </div>
              <div className="fs-reaction-list-users">
                {reactions[fsReactionListEmoji].map((u, i) => (
                  <span key={i} className="fs-reaction-user">{u}</span>
                ))}
              </div>
              <button
                type="button"
                className="fs-reaction-list-close"
                onClick={() => setFsReactionListEmoji(null)}
              >
                Закрыть
              </button>
            </div>
          )}

          {fsWheel && canReact && (
            <ReactionWheel
              open
              anchorX={fsWheel.x}
              anchorY={fsWheel.y}
              reactions={reactions || {}}
              nickname={nickname}
              onPick={handlePick}
              onClose={() => setFsWheel(null)}
              ignoreSelector=".fs-reaction-toggle"
            />
          )}
        </div>,
        document.body
      )}
    </>
  );
};

export default VideoAttachment;