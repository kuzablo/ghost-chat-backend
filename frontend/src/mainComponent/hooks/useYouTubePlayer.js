import { useEffect, useRef, useState, useCallback } from 'react';

const PLAYLIST = [
  '6VGePXh16l0',
  'rY8drrmx4k4',
  '6gRXToZhO1A',
];

let ytApiPromise = null;
const loadYouTubeApi = () => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
};

export const useYouTubePlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(50);
  const [trackIndex, setTrackIndex] = useState(0);
  const [trackTitle, setTrackTitle] = useState('');
  const [ready, setReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const playerRef = useRef(null);
  const containerIdRef = useRef(
    `yt-host-${Math.random().toString(36).slice(2)}`
  );
  const volumeRef = useRef(volume);
  const trackIndexRef = useRef(trackIndex);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const host = document.getElementById(containerIdRef.current);
      if (!host) return;

      playerRef.current = new YT.Player(containerIdRef.current, {
        height: '120',
        width: '200',
        videoId: PLAYLIST[0],
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          rel: 0,
          host: 'https://www.youtube-nocookie.com',
        },
        events: {
          onReady: (e) => {
            setReady(true);
            e.target.setVolume(volumeRef.current);
          },
          onStateChange: (e) => {
            try {
              const data = e.target.getVideoData?.();
              if (data?.title) setTrackTitle(data.title);
            } catch (err) { /* noop */ }

            if (e.data === 1) {
              setIsPlaying(true);
              setHasStarted(true);
            } else if (e.data === 2) {
              setIsPlaying(false);
            } else if (e.data === 0) {
              const nextIdx = (trackIndexRef.current + 1) % PLAYLIST.length;
              setTrackIndex(nextIdx);
              playerRef.current?.loadVideoById(PLAYLIST[nextIdx]);
              playerRef.current?.playVideo();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch (e) { /* noop */ }
      playerRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    const state = p.getPlayerState?.();
    if (state === 1) p.pauseVideo();
    else p.playVideo();
  }, [ready]);

  const next = useCallback(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    const nextIdx = (trackIndexRef.current + 1) % PLAYLIST.length;
    setTrackIndex(nextIdx);
    p.loadVideoById(PLAYLIST[nextIdx]);
    p.playVideo();
  }, [ready]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setVolumeState(clamped);
    playerRef.current?.setVolume?.(clamped);
  }, []);

  return {
    isPlaying,
    volume,
    trackIndex,
    trackTitle,
    ready,
    hasStarted,
    containerId: containerIdRef.current,
    toggle,
    next,
    setVolume,
  };
};