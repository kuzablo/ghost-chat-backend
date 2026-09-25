import { useState, useEffect, useRef } from 'react';
import SmartImage from './SmartImage';
import { getAvatarColor, getInitial } from '../utils';

/*
  [2.47.0] Карточка хранилища. Компактное превью по типу.
  - text    → цитата
  - image   → SmartImage, cover
  - sticker → SmartImage, contain
  - voice   → мини-плеер (свой, лёгкий)
  - video   → video-превью, play по тапу
*/

const TYPE_ICON = {
  text: '📝',
  image: '📷',
  sticker: '🎨',
  voice: '🎤',
  video: '📹',
};

const fmt = (s) => {
  const v = Math.max(0, Math.floor(s));
  const m = Math.floor(v / 60);
  const ss = String(v % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

const StorageTile = ({ item, onDelete }) => {
  const { type, payload, source } = item;

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      const total = payload.voiceDuration || a.duration || 1;
      setProgress(Math.min(1, a.currentTime / total));
    };
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
    };
  }, [payload.voiceDuration]);

  const toggleVoice = (e) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const renderPreview = () => {
    if (type === 'text') {
      const t = (payload.text || '').trim();
      return <div className="storage-tile-text">{t.slice(0, 220)}</div>;
    }
    if (type === 'image') {
      return (
        <SmartImage
          src={payload.imageUrl}
          alt=""
          wrapperClassName="storage-tile-imgwrap"
          imgClassName="storage-tile-img"
          fit="cover"
        />
      );
    }
    if (type === 'sticker') {
      return (
        <SmartImage
          src={payload.stickerUrl}
          alt=""
          wrapperClassName="storage-tile-imgwrap storage-tile-imgwrap--sticker"
          imgClassName="storage-tile-img"
          fit="contain"
        />
      );
    }
    if (type === 'voice') {
      const bars = Array.isArray(payload.voiceWaveform) && payload.voiceWaveform.length
        ? payload.voiceWaveform.slice(0, 24)
        : Array(24).fill(0.35);
      const active = Math.floor(progress * bars.length);
      return (
        <div className="storage-tile-voice" onClick={toggleVoice}>
          <button type="button" className="storage-tile-play" aria-label={playing ? 'Пауза' : 'Играть'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <div className="storage-tile-voice-wave" aria-hidden="true">
            {bars.map((v, i) => (
              <span
                key={i}
                className={`storage-tile-voice-bar ${i < active ? 'on' : ''}`}
                style={{ height: `${22 + Math.round(v * 60)}%` }}
              />
            ))}
          </div>
          <span className="storage-tile-voice-time">
            {playing && audioRef.current ? fmt(audioRef.current.currentTime) : fmt(payload.voiceDuration || 0)}
          </span>
          <audio ref={audioRef} src={payload.voiceUrl} preload="metadata" />
        </div>
      );
    }
    if (type === 'video') {
      return <StorageTileVideo payload={payload} />;
    }
    return null;
  };

  const avatarStyle = source?.nickname
    ? { background: getAvatarColor(source.nickname) }
    : { background: getAvatarColor('?') };

  return (
    <div className={`storage-tile storage-tile--${type}`}>
      <div className="storage-tile-media">
        {renderPreview()}
        <button
          type="button"
          className="storage-tile-del"
          onClick={(e) => { e.stopPropagation(); onDelete?.(item.id); }}
          aria-label="Удалить из хранилища"
          title="Удалить"
        >
          🗑️
        </button>
      </div>

      <div className="storage-tile-meta">
        <span className="storage-tile-type" aria-hidden="true">{TYPE_ICON[type]}</span>
        {source?.nickname && (
          <span className="storage-tile-from">
            <span className="storage-tile-from-avatar" style={avatarStyle}>
              {getInitial(source.nickname)}
            </span>
            <span className="storage-tile-from-nick">{source.nickname}</span>
          </span>
        )}
      </div>
    </div>
  );
};

const StorageTileVideo = ({ payload }) => {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fsOpen, setFsOpen] = useState(false);

  const toggle = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
  };

  const openFs = (e) => {
    e.stopPropagation();
    setFsOpen(true);
  };

  return (
    <>
      <div className="storage-tile-video" onClick={toggle}>
        <video
          ref={videoRef}
          src={payload.videoUrl}
          className="storage-tile-video-el"
          preload="metadata"
          muted={muted}
          playsInline
          onLoadedMetadata={(e) => { try { e.currentTarget.currentTime = 0.001; } catch {} }}
          onEnded={() => setPlaying(false)}
        />

        {!playing && (
          <span className="storage-tile-video-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}

        <div className="storage-tile-video-controls">
          <button
            type="button"
            className="storage-tile-video-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            title={muted ? 'Включить звук' : 'Выключить звук'}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="storage-tile-video-btn"
            onClick={openFs}
            aria-label="На весь экран"
            title="На весь экран"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>

        <span className="storage-tile-video-badge">{fmt(payload.videoDuration || 0)}</span>
      </div>

      {fsOpen && (
        <div className="storage-tile-fs" onClick={(e) => { e.stopPropagation(); setFsOpen(false); }}>
          <button
            type="button"
            className="storage-tile-fs-close"
            onClick={(e) => { e.stopPropagation(); setFsOpen(false); }}
            aria-label="Закрыть"
          >
            ✕
          </button>
          <video
            src={payload.videoUrl}
            className="storage-tile-fs-video"
            autoPlay
            playsInline
            controls
            muted={muted}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default StorageTile;