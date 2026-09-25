import { useRef, useState, useCallback, useEffect } from 'react';

/*
  [2.42.0] Запись видео-кружка (аналог voice, но с камерой).
           - maxDurationSec: 60
           - переключение фронт/зад с сохранением в localStorage
           - переключение возможно и во время записи: закрываем текущий
             MediaRecorder, открываем новый на другой камере, chunks
             копятся в один массив и склеиваются в один blob.
           - MIME: video/mp4 на Safari, video/webm на Chrome/Android.
*/

const PREFERRED_MIMES = [
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const FACING_KEY = 'ghost-chat-video-facing';
const DEFAULT_FACING = 'user';

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of PREFERRED_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch { /* noop */ }
  }
  return '';
};

const readFacing = () => {
  try {
    const v = localStorage.getItem(FACING_KEY);
    if (v === 'user' || v === 'environment') return v;
  } catch { /* noop */ }
  return DEFAULT_FACING;
};

const writeFacing = (v) => {
  try { localStorage.setItem(FACING_KEY, v); } catch { /* noop */ }
};

export const extFromVideoMime = (mime = '') => {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  return 'webm';
};

export const useVideoRecorder = ({ maxDurationSec = 60, onAutoStop } = {}) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [facing, setFacing] = useState(readFacing);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const mimeRef = useRef('');
  const cancelledRef = useRef(false);
  const onAutoStopRef = useRef(onAutoStop);
  const facingRef = useRef(facing);

  useEffect(() => { onAutoStopRef.current = onAutoStop; }, [onAutoStop]);
  useEffect(() => { facingRef.current = facing; }, [facing]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
      streamRef.current = null;
    }
    recorderRef.current = null;
    setStream(null);
  }, []);

  const buildStream = useCallback(async (mode) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-media');
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: mode,
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  }, []);

  const attachRecorder = useCallback((s, mime) => {
    let rec;
    try {
      rec = mime
        ? new MediaRecorder(s, {
            mimeType: mime,
            videoBitsPerSecond: 2500000,
            audioBitsPerSecond: 64000,
          })
        : new MediaRecorder(s);
    } catch {
      try { rec = new MediaRecorder(s); } catch { return null; }
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = rec;
    return rec;
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return false;
    setError('');
    cancelledRef.current = false;
    chunksRef.current = [];

    const mime = pickMime();
    mimeRef.current = mime;

    let s;
    try {
      s = await buildStream(facingRef.current);
    } catch {
      setError('Нет доступа к камере');
      return false;
    }
    streamRef.current = s;
    setStream(s);

    const rec = attachRecorder(s, mime);
    if (!rec) {
      cleanup();
      setError('Не удалось начать запись');
      return false;
    }

    startTimeRef.current = Date.now();
    setDuration(0);
    setRecording(true);
    try { rec.start(); } catch {
      cleanup();
      setRecording(false);
      setError('Не удалось начать запись');
      return false;
    }

    timerRef.current = setInterval(() => {
      const d = (Date.now() - startTimeRef.current) / 1000;
      setDuration(d);
      if (d >= maxDurationSec) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (onAutoStopRef.current) onAutoStopRef.current();
      }
    }, 100);

    return true;
  }, [attachRecorder, buildStream, cleanup, maxDurationSec]);

  const switchCamera = useCallback(async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    setFacing(next);
    writeFacing(next);

    // Не в записи — только меняем сохранённый выбор для следующего старта.
    if (!recorderRef.current && !streamRef.current) return;
    if (!recording) return;

    // В записи: закрываем текущий recorder, стартуем новый на другой камере.
    // Chunks копятся в один массив — склеятся в один blob.
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    setStream(null);

    let s;
    try {
      s = await buildStream(next);
    } catch {
      setError('Камера недоступна');
      return;
    }
    streamRef.current = s;
    setStream(s);

    const rec = attachRecorder(s, mimeRef.current);
    if (rec && !cancelledRef.current) {
      try { rec.start(); } catch { /* noop */ }
    }
  }, [attachRecorder, buildStream, recording]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    const wasCancelled = cancelledRef.current;
    const durMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

    if (rec) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        rec.onstop = finish;
        setTimeout(finish, 1500);
        try { rec.stop(); } catch { finish(); }
      });
    }

    const chunks = chunksRef.current.slice();
    chunksRef.current = [];
    const mimeType = mimeRef.current || 'video/webm';

    cleanup();
    setRecording(false);
    setDuration(0);
    startTimeRef.current = 0;

    if (wasCancelled) return null;
    if (durMs < 1000) return null;

    const blob = new Blob(chunks, { type: mimeType });
    const durSec = Math.min(maxDurationSec, Math.round(durMs / 100) / 10);

    return { blob, duration: durSec, mime: mimeType };
  }, [cleanup, maxDurationSec]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return {
    recording,
    duration,
    facing,
    stream,
    error,
    start,
    stop,
    cancel,
    switchCamera,
  };
};