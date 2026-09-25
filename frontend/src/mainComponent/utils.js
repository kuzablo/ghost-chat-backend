export const getAvatarColor = (nickname) => {
  if (!nickname) return 'linear-gradient(135deg, #b0c4de, #8a9bb5)';
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${hue2}, 70%, 40%))`;
};

export const getInitial = (nickname) => nickname ? nickname.charAt(0).toUpperCase() : '?';

export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

export const ensureAudioContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!window.__chatAudioCtx) {
    const ctx = new AudioContext();
    window.__chatAudioCtx = ctx;
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }
  if (window.__chatAudioCtx.state === 'suspended') {
    window.__chatAudioCtx.resume();
  }
};

export const playNotificationSound = () => {
  const ctx = window.__chatAudioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 523.25;
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.2);
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 659.25;
  osc2.connect(gain);
  osc2.start(now + 0.1);
  osc2.stop(now + 0.3);
};

// ===== Звук отправки сообщения =====
export const playSendSound = () => {
  const ctx = window.__chatAudioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.1);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.15);
};

// [2.46.0] Формат «время число месяц». Год — только если он не текущий.
// Сегодня / вчера / позавчера — с префиксом. Остальное — «14:30 24 сентября».
export const formatMessageDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(today);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (date >= today) {
    return `сегодня в ${timeStr}`;
  } else if (date >= yesterday) {
    return `вчера в ${timeStr}`;
  } else if (date >= dayBeforeYesterday) {
    return `позавчера в ${timeStr}`;
  }

  const isSameYear = date.getFullYear() === now.getFullYear();
  const dateStr = isSameYear
    ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return `${timeStr} ${dateStr}`;
};

export const formatDateDivider = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return 'Сегодня';
  if (date >= yesterday) return 'Вчера';

  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const isNewDay = (prevTimestamp, currentTimestamp) => {
  if (!currentTimestamp) return false;
  if (!prevTimestamp) return true;
  const a = new Date(prevTimestamp);
  const b = new Date(currentTimestamp);
  return a.toDateString() !== b.toDateString();
};