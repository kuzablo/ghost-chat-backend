import { useEffect, useRef, useState } from 'react';

/*
  [2.42.5] Плеер голосового. Один играет за раз (module singleton).
           Waveform — клик/тап по дорожке = перемотка.
*/

let currentlyPlaying = null;

const fmt = (s) => {
  const v = Math.max(0, Math.floor(s));
  const m = Math.floor(v / 60);
  const ss = String(v % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

const VoiceMessage = ({
  url,
  duration = 0,
  waveform = [],
  isOwn = false,
}) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  const bars = Array.isArray(waveform) && waveform.length > 0
    ? waveform
    : Array(40).fill(0.35);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => setCurrent(a.currentTime || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
      if (currentlyPlaying === a) currentlyPlaying = null;
    };
    const onStopped = () => {
      setPlaying(false);
      setCurrent(0);
    };

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('voice-stopped', onStopped);

    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('voice-stopped', onStopped);
      if (currentlyPlaying === a) {
        try { a.pause(); } catch { /* noop */ }
        currentlyPlaying = null;
      }
    };
  }, [url]);

  const play = () => {
    const a = audioRef.current;
    if (!a) return;
    if (currentlyPlaying && currentlyPlaying !== a) {
      try { currentlyPlaying.pause(); } catch { /* noop */ }
      currentlyPlaying.currentTime = 0;
      currentlyPlaying.dispatchEvent(new Event('voice-stopped'));
    }
    currentlyPlaying = a;
    a.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  const pause = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setPlaying(false);
    if (currentlyPlaying === a) currentlyPlaying = null;
  };

  const onWaveClick = (e) => {
    const a = audioRef.current;
    if (!a) return;
    const total = duration > 0 ? duration : (a.duration || 0);
    if (!total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    try { a.currentTime = ratio * total; } catch { /* noop */ }
    setCurrent(ratio * total);
  };

  const total = duration > 0 ? duration : 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;
  const activeBars = Math.floor(progress * bars.length);

  return (
    <div className={`voice-msg ${isOwn ? 'voice-msg--own' : ''} ${playing ? 'voice-msg--playing' : ''}`}>
      <button
        type="button"
        className="voice-msg-play"
        onClick={(e) => { e.stopPropagation(); playing ? pause() : play(); }}
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

      <div className="voice-msg-wave" onClick={onWaveClick}>
        {bars.map((v, i) => (
          <span
            key={i}
            className={`voice-msg-bar ${i < activeBars ? 'voice-msg-bar--active' : ''}`}
            style={{ height: `${22 + Math.round(v * 78)}%` }}
          />
        ))}
      </div>

      <span className="voice-msg-time">
        {playing || current > 0 ? fmt(current) : fmt(total)}
      </span>

      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  );
};

export default VoiceMessage;