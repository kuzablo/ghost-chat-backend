import { useRef, useState, useCallback, useEffect } from 'react';

/*
  [2.35.58] Запись голосового с pause/resume.
            mp4/aac → webm/opus (по поддержке).
*/

const PREFERRED_MIMES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
];

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of PREFERRED_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch { /* noop */ }
  }
  return '';
};

const computeWaveform = async (blob, samples = 40) => {
  try {
    const buf = await blob.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const audioBuf = await ctx.decodeAudioData(buf.slice(0));
    try { ctx.close(); } catch { /* noop */ }
    const channel = audioBuf.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / samples));
    const out = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channel[i * blockSize + j] || 0);
      }
      out.push(sum / blockSize);
    }
    const max = Math.max(...out, 0.001);
    return out.map(v => Math.min(1, v / max));
  } catch {
    return null;
  }
};

export const useVoiceRecorder = ({ maxDurationSec = 60, onAutoStop } = {}) => {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const pauseStartedAtRef = useRef(0);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const cancelledRef = useRef(false);
  const mimeRef = useRef('');
  const onAutoStopRef = useRef(onAutoStop);

  useEffect(() => { onAutoStopRef.current = onAutoStop; }, [onAutoStop]);

  const getElapsedMs = () => {
    if (paused) return accumulatedMsRef.current;
    return accumulatedMsRef.current + (Date.now() - startTimeRef.current);
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* noop */ }
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
      streamRef.current = null;
    }
    recorderRef.current = null;
    analyserRef.current = null;
    accumulatedMsRef.current = 0;
    pauseStartedAtRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return false;
    if (!navigator.mediaDevices?.getUserMedia) return false;

    cancelledRef.current = false;
    chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false;
    }
    streamRef.current = stream;

    const mime = pickMime();
    mimeRef.current = mime;

    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      try { rec = new MediaRecorder(stream); } catch { cleanup(); return false; }
    }
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        if (!pausedRefCurrent()) {
          analyserRef.current.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          setLevel(peak);
        } else {
          setLevel(0);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* analyser — необязателен */ }

    accumulatedMsRef.current = 0;
    startTimeRef.current = Date.now();
    setDuration(0);
    setPaused(false);
    setRecording(true);

    rec.start();

    timerRef.current = setInterval(() => {
      const dMs = getElapsedMs();
      const d = dMs / 1000;
      setDuration(d);
      if (d >= maxDurationSec) {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (onAutoStopRef.current) onAutoStopRef.current();
      }
    }, 100);

    return true;
  }, [cleanup, maxDurationSec]);

  // [2.35.58] ref-обёртка, чтобы анализатор знал текущее paused без пересоздания
  const pausedRefCurrent = () => pausedRef.current;
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || pausedRef.current) return;
    try { rec.pause(); } catch { /* noop */ }
    accumulatedMsRef.current += Date.now() - startTimeRef.current;
    pauseStartedAtRef.current = Date.now();
    setPaused(true);
    setLevel(0);
  }, []);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || !pausedRef.current) return;
    try { rec.resume(); } catch { /* noop */ }
    startTimeRef.current = Date.now();
    pauseStartedAtRef.current = 0;
    setPaused(false);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) {
      cleanup();
      setRecording(false);
      setPaused(false);
      return null;
    }
    const wasCancelled = cancelledRef.current;
    const wasPaused = pausedRef.current;
    const durMs = wasPaused
      ? accumulatedMsRef.current
      : accumulatedMsRef.current + (Date.now() - startTimeRef.current);

    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      rec.onstop = finish;
      setTimeout(finish, 1500);
      try {
        if (wasPaused) { try { rec.resume(); } catch { /* noop */ } }
        rec.stop();
      } catch { finish(); }
    });

    const chunks = chunksRef.current.slice();
    chunksRef.current = [];

    cleanup();
    setRecording(false);
    setPaused(false);
    setLevel(0);

    if (wasCancelled) return null;
    if (durMs < 700) return null;

    const mimeType = mimeRef.current || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });
    const durSec = Math.min(maxDurationSec, Math.round(durMs / 100) / 10);
    const waveform = await computeWaveform(blob);

    return {
      blob,
      duration: durSec,
      waveform: waveform || Array(40).fill(0.3),
      mime: mimeType,
    };
  }, [cleanup, maxDurationSec]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { recording, paused, duration, level, start, pause, resume, cancel, stop };
};

export const extFromMime = (mime = '') => {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
};