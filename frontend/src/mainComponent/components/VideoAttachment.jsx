import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/*
  [2.50.2] Видео-файл. Прямоугольник по aspect ratio видео. Без границ,
           без обводок — как image-only. Тап — play/pause, кнопки mute
           и fullscreen в углу. Автоплей не делаем — только по тапу.
           Fullscreen через createPortal — как у кружка.
*/

let currentlyPlayingAttachment = null;

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

const VideoAttachment = ({ url, isOwn = false }) => {
  const videoRef = useRef(null);
  const fsRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fsOpen, setFsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMeta = () => {
      setReady(true);
      try {
        if (v.videoWidth && v.videoHeight) {
          setAspect(v.videoWidth / v.videoHeight);
        }
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

  useEffect(() => {
    if (!fsOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFsOpen(false); };
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
  const closeFs = (e) => { if (e) e.stopPropagation(); setFsOpen(false); };

  return (
    <>
      <div className={`video-attachment ${isOwn ? 'video-attachment--own' : ''}`}>
        <div
          className="video-attachment-frame"
          style={{ aspectRatio: String(aspect) }}
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
        <div className="video-attachment-fs" onClick={closeFs}>
          <button
            type="button"
            className="video-attachment-fs-close"
            onClick={closeFs}
            aria-label="Закрыть"
          >
            <Icon.Close />
          </button>
          <video
            ref={fsRef}
            src={url}
            className="video-attachment-fs-el"
            autoPlay
            playsInline
            controls
            muted={muted}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  );
};

export default VideoAttachment;