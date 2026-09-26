import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { formatTime, formatMessageDate, getAvatarColor, getInitial } from '../utils';
import ChatInput from './ChatInput';
import InputActionButtons from './InputActionButtons';
import InstagramCard, { extractInstagramUrl } from './InstagramCard';
import StickerPanel from './StickerPanel';
import MessageActionsMenu from './MessageActionsMenu';
import ReactionWheel from './ReactionWheel';
import VoiceMessage from './VoiceMessage';
import VideoMessage from './VideoMessage';
import VoiceRecordingOverlay from './VoiceRecordingOverlay';
import VideoRecordingOverlay from './VideoRecordingOverlay';
import ConfirmModal from './ConfirmModal';
import SendingIndicator from './SendingIndicator';
import SmartImage from './SmartImage';
import Avatar from './Avatar';
import { useVoiceRecorder, extFromMime } from '../hooks/useVoiceRecorder';
import { useVideoRecorder, extFromVideoMime } from '../hooks/useVideoRecorder';

/*
  [2.46.0] Авто-выбор фильтра по дате при первом открытии: если последнее
           сообщение сегодня → «Сегодня», если за последние 7 дней → «7 дней»,
           за 30 дней → «30 дней», иначе «Всё». Стрелка скролла теперь
           привязана к .private-messages-wrap — всегда над лентой, не съезжает.
  [2.45.0] Avatar с маскот-плейсхолдером.
  [2.44.0] SmartImage для фото.
  [2.43.0] SendingIndicator вместо строки ввода на время upload.
  [2.42.3] mic/cam обычный клик, разрешения сразу (аудио+видео).
  [2.42.0] InputActionButtons, video rec/upload, avatar в voice overlay.
*/

const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
// [2.50.0] Видео-файлы — 100 МБ.
const MAX_VIDEO_MB = 100;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const API_URL = 'https://api.banjoboy420.ru';

const SWIPE_THRESHOLD = 90;
const SWIPE_MAX = 220;
const DIRECTION_LOCK = 10;
const LONG_PRESS_MENU_MS = 500;
const LONG_PRESS_IGNORE_MS = 500;

const DATE_FILTERS = [
  { id: 'all', label: 'Всё', days: null },
  { id: 'today', label: 'Сегодня', days: 0 },
  { id: '7d', label: '7 дней', days: 7 },
  { id: '30d', label: '30 дней', days: 30 },
];

const StickerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l7-7V6a3 3 0 0 0-3-3z" />
    <path d="M13 21v-5a3 3 0 0 1 3-3h5" />
  </svg>
);

const ClipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const getBgCss = (bg) => {
  if (!bg) return null;
  if (bg.startsWith('preset:')) return null;
  if (bg.startsWith('url:')) return `url(${bg.slice('url:'.length)})`;
  return null;
};

const isUrlBg = (bg) => !!(bg && bg.startsWith('url:'));

const getSinceTs = (days) => {
  if (days === null) return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - days);
  return d.getTime();
};

const PrivateChat = ({
  userId, nickname, myId, myNickname, sendMessage, onClose,
  initialMessages = [], historyLoaded = true, dialogsBg = null,
  typingUser = null, stickers = [], isAdmin = false, token = '',
  onStickersUpdated, onForward, avatarUrl = null,
  favoriteStickers = [], onToggleFavorite,
  myAvatarUrl = null,
  storageSourceIds = new Set(),
  onSaveToStorage,
}) => {
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [localTypingUser, setLocalTypingUser] = useState(typingUser);
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const [poppingId, setPoppingId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isVideoFileUploading, setIsVideoFileUploading] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [actionsMenu, setActionsMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [dateFilter, setDateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollDown, setShowScrollDown] = useState(false);

  const [voiceRecActive, setVoiceRecActive] = useState(false);
  const [voiceRecFrozen, setVoiceRecFrozen] = useState(false);
  const [videoRecActive, setVideoRecActive] = useState(false);

  const permGrantedRef = useRef(false);
  const autoFilterAppliedRef = useRef(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastMsgIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const longPressRef = useRef({ timer: null, completedAt: 0 });

  const sendVoiceMessageRef = useRef(null);
  const sendVideoMessageRef = useRef(null);

  const voiceRec = useVoiceRecorder({
    maxDurationSec: 60,
    onAutoStop: () => { sendVoiceMessageRef.current?.(); },
  });

  const videoRec = useVideoRecorder({
    maxDurationSec: 60,
    onAutoStop: () => { sendVideoMessageRef.current?.(); },
  });

  const swipeRef = useRef({ active: false, startX: 0, startY: 0, direction: null, lastDx: 0 });

  const favoriteSet = useMemo(
    () => new Set(Array.isArray(favoriteStickers) ? favoriteStickers : []),
    [favoriteStickers]
  );

  const hitIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set();
    const s = new Set();
    initialMessages.forEach(m => { if (m.text && m.text.toLowerCase().includes(q)) s.add(m.id); });
    return s;
  }, [initialMessages, searchQuery]);

  const filteredMessages = useMemo(() => {
    const filter = DATE_FILTERS.find(f => f.id === dateFilter);
    let list = initialMessages;
    if (filter && filter.days !== null) {
      const since = getSinceTs(filter.days);
      list = list.filter(m => {
        if (!m.created_at) return false;
        return new Date(m.created_at).getTime() >= since;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(m => (m.text || '').toLowerCase().includes(q));
    return list;
  }, [initialMessages, dateFilter, searchQuery]);

  // [2.46.0] Авто-выбор фильтра по дате: один раз, при первой загрузке.
  // Если пользователь потом выберет сам — не перебиваем.
  useEffect(() => {
    if (autoFilterAppliedRef.current) return;
    if (!historyLoaded) return;
    if (!initialMessages.length) return;
    autoFilterAppliedRef.current = true;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const monthStart = todayStart - 30 * 24 * 60 * 60 * 1000;

    const latest = initialMessages.reduce((max, m) => {
      const t = m.created_at ? new Date(m.created_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);

    if (!latest) return;
    if (latest >= todayStart) setDateFilter('today');
    else if (latest >= weekStart) setDateFilter('7d');
    else if (latest >= monthStart) setDateFilter('30d');
    else setDateFilter('all');
  }, [historyLoaded, initialMessages]);

  useEffect(() => { setLocalTypingUser(typingUser); }, [typingUser]);

  useEffect(() => {
    if (!pickerFor) setPickerAnchor(null);
  }, [pickerFor]);

  useEffect(() => {
    const last = filteredMessages[filteredMessages.length - 1];
    const lastId = last?.id ?? null;
    if (lastId === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastId;
    const id = requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [filteredMessages]);

  useEffect(() => {
    const isUrl = isUrlBg(dialogsBg);
    if (!isUrl) { setBgLoaded(true); return; }
    setBgLoaded(false);
    const url = dialogsBg.slice('url:'.length);
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(true);
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [dialogsBg]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    let rafId = null;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const d = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollDown(d > 200);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
    };
  }, [searchQuery, dateFilter]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = 0; });
  }, [searchQuery]);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const openActionsMenuFor = (m, el) => {
    const containerEl = messagesContainerRef.current;
    if (!containerEl) return;
    const target = el?.closest('.private-msg') || el;
    const rect = (target || containerEl).getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    setActionsMenu({
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      container: {
        top: containerRect.top, left: containerRect.left,
        right: containerRect.right, bottom: containerRect.bottom,
      },
      msg: m,
    });
  };

  const closeActionsMenu = () => setActionsMenu(null);

  const buildForwardData = (m) => {
    const isOwn = m.senderId === myId;
    const authorNick = isOwn ? (myNickname || 'Я') : nickname;
    const forwardedFrom = m.forwardedFrom
      ? m.forwardedFrom
      : {
        nickname: authorNick,
        originalId: m.id,
        originalTime: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
        fromPrivate: true,
      };
    return {
      text: m.text || '',
      imageUrl: m.imageUrl || null,
      stickerUrl: m.stickerUrl || null,
      voiceUrl: m.voiceUrl || null,
      voiceDuration: m.voiceDuration || null,
      voiceWaveform: m.voiceWaveform || null,
      videoUrl: m.videoUrl || null,
      videoDuration: m.videoDuration || null,
      videoMime: m.videoMime || null,
      forwardedFrom,
    };
  };

  const buildStorageData = (m) => {
    let type = 'text';
    if (m.stickerUrl) type = 'sticker';
    else if (m.videoUrl) type = 'video';
    else if (m.voiceUrl) type = 'voice';
    else if (m.imageUrl) type = 'image';

    const payload = {};
    if (type === 'text') {
      payload.text = m.text || '';
    } else if (type === 'image') {
      payload.imageUrl = m.imageUrl;
      if (m.text?.trim()) payload.text = m.text;
    } else if (type === 'sticker') {
      payload.stickerUrl = m.stickerUrl;
    } else if (type === 'voice') {
      payload.voiceUrl = m.voiceUrl;
      payload.voiceDuration = m.voiceDuration || 0;
      payload.voiceWaveform = m.voiceWaveform || [];
    } else if (type === 'video') {
      payload.videoUrl = m.videoUrl;
      payload.videoDuration = m.videoDuration || 0;
      payload.videoMime = m.videoMime || null;
    }

    const isOwn = m.senderId === myId;
    const authorNick = isOwn ? (myNickname || 'Я') : nickname;

    const source = {
      nickname: authorNick,
      messageId: m.id,
      originalTime: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      fromPrivate: true,
    };

    return { type, payload, source };
  };


  const handlePanelTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.private-msg')) return;
    if (e.target.closest('.private-search-wrap')) return;
    const t = e.touches[0];
    const s = swipeRef.current;
    s.active = true; s.startX = t.clientX; s.startY = t.clientY; s.direction = null; s.lastDx = 0;
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };

  const handlePanelTouchMove = (e) => {
    const s = swipeRef.current;
    if (!s.active) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.direction) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      s.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (s.direction === 'vertical') return;
    const off = Math.min(Math.abs(dx), SWIPE_MAX);
    s.lastDx = off;
    if (panelRef.current) {
      const sign = dx > 0 ? 1 : -1;
      panelRef.current.style.transform = `translateX(calc(-50% + ${sign * off}px))`;
      panelRef.current.style.opacity = String(Math.max(0.35, 1 - off / 400));
    }
    if (e.cancelable) e.preventDefault();
  };

  const handlePanelTouchEnd = () => {
    const s = swipeRef.current;
    if (!s.active) return;
    s.active = false;
    if (s.direction === 'horizontal' && s.lastDx > SWIPE_THRESHOLD) { onClose(); return; }
    if (panelRef.current) {
      panelRef.current.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.24s';
      panelRef.current.style.transform = 'translateX(-50%)';
      panelRef.current.style.opacity = '1';
      setTimeout(() => { if (panelRef.current) panelRef.current.style.transition = ''; }, 260);
    }
    s.direction = null;
    s.lastDx = 0;
  };

  const cancelLongPress = () => {
    if (longPressRef.current.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current.timer = null; }
  };

  const handleMsgTouchStart = (e, m) => {
    if (e.touches.length !== 1) return;
    const el = e.currentTarget;
    longPressRef.current.timer = setTimeout(() => {
      longPressRef.current.timer = null;
      longPressRef.current.completedAt = Date.now();
      openActionsMenuFor(m, el);
    }, LONG_PRESS_MENU_MS);
  };

  const handleMsgTouchMove = () => { cancelLongPress(); };
  const handleMsgTouchEnd = () => { cancelLongPress(); };

  const handleSend = () => {
    if (!input.trim()) return;
    if (!sendMessage) return;
    const ok = sendMessage({ type: 'private_message', data: { recipientId: userId, text: input.trim() } });
    if (!ok) return;
    setInput('');
    sendMessage({ type: 'private_typing', data: { recipientId: userId, isTyping: false } });
  };

  const handleStickerPick = (stickerUrl) => {
    if (!sendMessage || !stickerUrl) return;
    sendMessage({ type: 'private_message', data: { recipientId: userId, stickerUrl } });
    setStickerPanelOpen(false);
    sendMessage({ type: 'private_typing', data: { recipientId: userId, isTyping: false } });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      setUploadError('Только фото или видео');
      setTimeout(() => setUploadError(''), 4000);
      return;
    }

    const limitMb = isVideo ? MAX_VIDEO_MB : MAX_UPLOAD_MB;
    const limitBytes = isVideo ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;

    if (file.size > limitBytes) {
      setUploadError(`Файл больше ${limitMb} МБ`);
      setTimeout(() => setUploadError(''), 4000);
      return;
    }

    setIsUploading(true);
    if (isVideo) setIsVideoFileUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const endpoint = isVideo
        ? `${API_URL}/api/upload-video`
        : `${API_URL}/api/upload`;

      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (isVideo) {
        sendMessage({
          type: 'private_message',
          data: {
            recipientId: userId,
            text: '',
            videoUrl: data.videoUrl,
            videoDuration: 0,
            videoMime: file.type,
            isCircle: false,
          },
        });
      } else {
        sendMessage({
          type: 'private_message',
          data: { recipientId: userId, text: '', imageUrl: data.imageUrl },
        });
      }
    } catch (err) {
      console.error('Ошибка загрузки файла:', err);
      setUploadError('Не удалось загрузить');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setIsUploading(false);
      setIsVideoFileUploading(false);
    }
  };

  const sendReaction = (messageId, emoji) => {
    if (!sendMessage) return;
    sendMessage({ type: 'private_reaction', data: { messageId, emoji } });
    setPickerFor(null);
  };

  const handleMessageTap = (id, e) => {
    if (actionsMenu) { setActionsMenu(null); return; }
    if (Date.now() - longPressRef.current.completedAt < LONG_PRESS_IGNORE_MS) return;
    if (e.target.closest('.reaction-wheel')) return;
    if (e.target.closest('.reaction-wheel-anchor')) return;
    if (e.target.closest('.private-msg-image')) return;
    if (e.target.closest('.smart-image')) return;
    if (e.target.closest('.private-attach-btn')) return;
    if (e.target.closest('.ig-card')) return;
    if (e.target.closest('.private-msg-sticker')) return;
    if (e.target.closest('.voice-msg')) return;
    if (e.target.closest('.video-msg')) return;

    if (pickerFor === id) { setPickerFor(null); return; }

    setPoppingId(id);
    setTimeout(() => setPoppingId(null), 380);

    if (e && typeof e.clientX === 'number') {
      setPickerAnchor({ x: e.clientX, y: e.clientY });
    } else {
      setPickerAnchor(null);
    }

    setPickerFor(id);
  };

  const handlePrivateInput = (text) => {
    setInput(text);
    if (!sendMessage) return;
    if (text.trim()) {
      sendMessage({ type: 'private_typing', data: { recipientId: userId, isTyping: true } });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendMessage({ type: 'private_typing', data: { recipientId: userId, isTyping: false } });
      }, 1500);
    } else {
      sendMessage({ type: 'private_typing', data: { recipientId: userId, isTyping: false } });
    }
  };

  const renderForwardLabel = (m) => {
    if (!m.forwardedFrom) return null;
    const ff = m.forwardedFrom;
    return (
      <div className="private-msg-forward-label">
        <span className="private-msg-forward-arrow">↪</span>
        <span className="private-msg-forward-nick">Переслано от {ff.nickname}</span>
        {ff.originalTime && (
          <span className="private-msg-forward-time">· {formatMessageDate(ff.originalTime)}</span>
        )}
      </div>
    );
  };

  // ===== PERMISSIONS =====

  const ensureMediaPermissions = useCallback(async () => {
    if (permGrantedRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError('Камера и микрофон недоступны в этом браузере');
      setTimeout(() => setUploadError(''), 4000);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
      permGrantedRef.current = true;
      return true;
    } catch {
      setUploadError('Разреши доступ к камере и микрофону');
      setTimeout(() => setUploadError(''), 5000);
      return false;
    }
  }, []);

  // ===== VOICE =====

  const uploadAndSendVoice = useCallback(async (result) => {
    if (!result) return;
    setVoiceUploading(true);
    const fd = new FormData();
    const ext = extFromMime(result.mime);
    fd.append('file', result.blob, `voice_${Date.now()}.${ext}`);
    try {
      const res = await fetch(`${API_URL}/api/upload-voice`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      sendMessage({
        type: 'private_message',
        data: {
          recipientId: userId,
          text: '',
          voiceUrl: data.voiceUrl,
          voiceDuration: result.duration,
          voiceWaveform: result.waveform,
        },
      });
    } catch (err) {
      console.error('Ошибка загрузки голосового:', err);
      setUploadError('Не удалось отправить голосовое');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setVoiceUploading(false);
    }
  }, [sendMessage, userId]);

  const cancelVoice = useCallback(async () => {
    voiceRec.cancel();
    await voiceRec.stop();
    setVoiceRecActive(false);
    setVoiceRecFrozen(false);
  }, [voiceRec]);

  const finalizeVoice = useCallback(async () => {
    if (!voiceRecActive) return;
    const result = await voiceRec.stop();
    setVoiceRecActive(false);
    setVoiceRecFrozen(false);
    if (result) await uploadAndSendVoice(result);
  }, [voiceRecActive, voiceRec, uploadAndSendVoice]);

  const sendVoiceNow = useCallback(async () => { await finalizeVoice(); }, [finalizeVoice]);
  const cancelVoiceNow = useCallback(async () => { await cancelVoice(); }, [cancelVoice]);

  sendVoiceMessageRef.current = () => {
    if (!voiceRecActive) return;
    voiceRec.pause();
    setVoiceRecFrozen(true);
  };

  const handleVoiceClick = useCallback(async () => {
    if (isUploading) return;
    if (voiceRecActive) return;

    if (videoRecActive) {
      videoRec.cancel();
      await videoRec.stop();
      setVideoRecActive(false);
    }

    const ok = await ensureMediaPermissions();
    if (!ok) return;
    const started = await voiceRec.start();
    if (started) { setVoiceRecActive(true); setVoiceRecFrozen(false); }
  }, [isUploading, voiceRecActive, videoRecActive, ensureMediaPermissions, voiceRec, videoRec]);

  // ===== VIDEO =====

  const uploadAndSendVideo = useCallback(async (result) => {
    if (!result) return;
    setVideoUploading(true);
    const fd = new FormData();
    const ext = extFromVideoMime(result.mime);
    fd.append('file', result.blob, `video_${Date.now()}.${ext}`);
    try {
      const res = await fetch(`${API_URL}/api/upload-video`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      sendMessage({
        type: 'private_message',
        data: {
          recipientId: userId,
          text: '',
          videoUrl: data.videoUrl,
          videoDuration: result.duration,
          videoMime: result.mime,
        },
      });
    } catch (err) {
      console.error('Ошибка загрузки видео:', err);
      setUploadError('Не удалось отправить видео');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setVideoUploading(false);
    }
  }, [sendMessage, userId]);

  const handleCameraClick = useCallback(async () => {
    if (isUploading) return;
    if (videoRecActive) return;

    if (voiceRecActive) {
      voiceRec.cancel();
      await voiceRec.stop();
      setVoiceRecActive(false);
      setVoiceRecFrozen(false);
    }

    const ok = await ensureMediaPermissions();
    if (!ok) return;
    const started = await videoRec.start();
    if (started) setVideoRecActive(true);
  }, [isUploading, videoRecActive, voiceRecActive, ensureMediaPermissions, videoRec, voiceRec]);

  const finalizeVideo = useCallback(async () => {
    if (!videoRecActive) return;
    const result = await videoRec.stop();
    setVideoRecActive(false);
    if (result) await uploadAndSendVideo(result);
  }, [videoRecActive, videoRec, uploadAndSendVideo]);

  const sendVideoNow = useCallback(async () => { await finalizeVideo(); }, [finalizeVideo]);
  const cancelVideoNow = useCallback(async () => {
    videoRec.cancel();
    await videoRec.stop();
    setVideoRecActive(false);
  }, [videoRec]);

  sendVideoMessageRef.current = () => {
    if (!videoRecActive) return;
    sendVideoNow();
  };

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    if (sendMessage) {
      sendMessage({ type: 'private_delete_message', data: { messageId: confirmDelete.messageId } });
    }
    setConfirmDelete(null);
  }, [confirmDelete, sendMessage]);

  const bgCss = getBgCss(dialogsBg);
  const hasBg = !!bgCss;
  const bgIsUrl = isUrlBg(dialogsBg);
  const showBgLoading = bgIsUrl && !bgLoaded;

  const panelStyle = hasBg && !showBgLoading
    ? { backgroundImage: bgCss, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
    : undefined;

  const hasSearch = !!searchQuery.trim();

  const activeMessage = pickerFor
    ? filteredMessages.find(x => x.id === pickerFor)
    : null;

  const inputActive = !!input.trim() || inputFocused;

  const isBusySending = isUploading || voiceUploading || videoUploading;
  const sendingLabel = voiceUploading
    ? 'Отправляем голосовое'
    : (videoUploading || isVideoFileUploading)
      ? 'Отправляем видео'
      : 'Отправляем фото';

  return (
    <>
      <div className="blur-overlay" onClick={onClose} />
      <div
        className={`private-chat-overlay ${hasBg ? 'private-chat-overlay--custom' : ''}`}
        ref={panelRef}
        style={panelStyle}
        onTouchStart={handlePanelTouchStart}
        onTouchMove={handlePanelTouchMove}
        onTouchEnd={handlePanelTouchEnd}
        onTouchCancel={handlePanelTouchEnd}
      >
        <div className="private-chat-header">
          <div className="private-chat-header-left">
            <Avatar
              src={avatarUrl}
              nickname={nickname}
              className="private-chat-avatar"
              alt=""
            />
            <h4>{nickname}</h4>
          </div>
        </div>

        <div className="private-search-wrap">
          <input
            className="private-search-input"
            type="text"
            placeholder="Поиск по сообщениям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {hasSearch && (
            <>
              <span className="private-search-count">{filteredMessages.length}</span>
              <button type="button" className="private-search-clear" onClick={() => setSearchQuery('')} aria-label="Очистить поиск">✕</button>
            </>
          )}
        </div>

        <div className="private-date-filters">
          {DATE_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`private-date-chip ${dateFilter === f.id ? 'private-date-chip--active' : ''}`}
              onClick={() => setDateFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="private-typing">
          {localTypingUser ? `${localTypingUser} печатает...` : ''}
        </div>

        {/* [2.46.0] Обёртка вокруг messages + стрелка — стрелка привязана
            к .private-messages-wrap, а не к overlay. Не съезжает. */}
        <div className="private-messages-wrap">
          <div className="private-messages" ref={messagesContainerRef}>
            {showBgLoading || !historyLoaded ? (
              <div className="private-loading" aria-hidden="true">
                <div className="private-loading-mascot" />
              </div>
            ) : (
              <>
                {filteredMessages.length === 0 && (
                  <div className="private-empty">
                    {hasSearch ? 'Ничего не найдено' : 'В этом периоде сообщений нет'}
                  </div>
                )}

                {filteredMessages.map((m, i) => {
                  const isOwn = m.senderId === myId;
                  const forwardLabel = renderForwardLabel(m);
                  const isHit = hitIds.has(m.id);

                  if (m.stickerUrl) {
                    return (
                      <div
                        key={m.id || i}
                        data-msg-id={m.id}
                        className={`private-msg private-msg--sticker ${isOwn ? 'private-msg--own' : 'private-msg--other'} ${isHit ? 'private-msg--hit' : ''}`}
                        onTouchStart={(e) => handleMsgTouchStart(e, m)}
                        onTouchMove={handleMsgTouchMove}
                        onTouchEnd={handleMsgTouchEnd}
                      >
                        {forwardLabel}
                        <img src={m.stickerUrl} alt="" className="private-msg-sticker" draggable={false} loading="lazy" />
                      </div>
                    );
                  }

                  const isVoiceOnly = !m.text?.trim() && !m.imageUrl && !!m.voiceUrl;

                  if (isVoiceOnly) {
                    return (
                      <div
                        key={m.id || i}
                        data-msg-id={m.id}
                        className={`private-msg private-msg--voice ${isOwn ? 'private-msg--own' : 'private-msg--other'}`}
                        onTouchStart={(e) => handleMsgTouchStart(e, m)}
                        onTouchMove={handleMsgTouchMove}
                        onTouchEnd={handleMsgTouchEnd}
                      >
                        {forwardLabel}
                        <VoiceMessage
                          url={m.voiceUrl}
                          duration={m.voiceDuration || 0}
                          waveform={m.voiceWaveform || []}
                          isOwn={isOwn}
                        />
                      </div>
                    );
                  }

                  const isVideoOnly = !m.text?.trim() && !m.imageUrl && !m.voiceUrl && !!m.videoUrl;

                  if (isVideoOnly) {
                    return (
                      <div
                        key={m.id || i}
                        data-msg-id={m.id}
                        className={`private-msg private-msg--video ${isOwn ? 'private-msg--own' : 'private-msg--other'}`}
                        onTouchStart={(e) => handleMsgTouchStart(e, m)}
                        onTouchMove={handleMsgTouchMove}
                        onTouchEnd={handleMsgTouchEnd}
                      >
                        {forwardLabel}
                        <VideoMessage
                          url={m.videoUrl}
                          isOwn={isOwn}
                          createdAt={m.created_at}
                          messageId={m.id}
                          reactions={m.reactions || {}}
                          nickname={myId}
                          onReact={sendReaction}
                        />
                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <div className="msg-video-reactions">
                            {Object.entries(m.reactions).map(([emoji, users]) => (
                              <span key={emoji} className={`msg-video-reaction-badge ${users.includes(myId) ? 'own' : ''}`}>
                                {emoji}
                                {users.length > 1 && <span className="msg-video-reaction-count">{users.length}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const reactions = m.reactions || {};
                  const reactionEntries = Object.entries(reactions);
                  const hasReactions = reactionEntries.length > 0;
                  const igUrl = extractInstagramUrl(m.text);

                  return (
                    <div
                      key={m.id || i}
                      data-msg-id={m.id}
                      className={`private-msg ${isOwn ? 'private-msg--own' : 'private-msg--other'} ${poppingId === m.id ? 'private-msg--pop' : ''} ${hasReactions ? 'private-msg--has-reactions' : ''} ${pickerFor === m.id ? 'private-msg--picker-open' : ''} ${isHit ? 'private-msg--hit' : ''}`}
                      onClick={(e) => handleMessageTap(m.id, e)}
                      onTouchStart={(e) => handleMsgTouchStart(e, m)}
                      onTouchMove={handleMsgTouchMove}
                      onTouchEnd={handleMsgTouchEnd}
                    >
                      <div className="private-msg-text-wrap">
                        {forwardLabel}
                        {m.imageUrl && (
                          <SmartImage
                            src={m.imageUrl}
                            alt="photo"
                            wrapperClassName="private-msg-image-smart"
                            imgClassName="private-msg-image"
                            draggable={false}
                            onClick={(e) => { e.stopPropagation(); setFullscreenImage(m.imageUrl); }}
                          />
                        )}
                        {m.text && <span className="private-msg-text">{m.text}</span>}
                        {igUrl && <InstagramCard url={igUrl} />}

                        {hasReactions && (
                          <div className="private-msg-reactions">
                            {reactionEntries.map(([emoji, users]) => (
                              <span key={`${emoji}-${users.length}`} className={`private-reaction-badge ${users.includes(myId) ? 'own' : ''}`}>
                                {emoji}
                                {users.length > 1 && (<span className="private-reaction-count">{users.length}</span>)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="private-msg-footer">
                        <span className="private-msg-time">{formatTime(m.created_at)}</span>
                        <span className="private-msg-status">{m.is_read ? 'прочитано' : 'не прочитано'}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {showScrollDown && (
            <button type="button" className="private-scroll-btn" onClick={scrollToBottom} aria-label="Вниз">↓</button>
          )}
        </div>

        {uploadError && (<div className="private-upload-error">{uploadError}</div>)}

        {isBusySending ? (
          <SendingIndicator label={sendingLabel} />
        ) : (
          <div className="private-input-row">
            <button
              type="button"
              className="input-icon-btn input-icon-btn--compact"
              onClick={() => setStickerPanelOpen(v => !v)}
              title="Стикеры"
              aria-label="Стикеры"
            >
              <StickerIcon />
            </button>
            <button
              type="button"
              className="input-icon-btn input-icon-btn--compact"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Прикрепить фото"
              aria-label="Прикрепить фото"
            >
              {isUploading ? '⏳' : <ClipIcon />}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*,video/*"
              style={{ display: 'none' }}
            />
            <ChatInput
              value={input}
              onChange={handlePrivateInput}
              onSend={handleSend}
              placeholder="Напишите сообщение..."
              draftKey={null}
              onFocusChange={setInputFocused}
            />
            <InputActionButtons
              active={inputActive}
              disabled={isUploading}
              sending={false}
              rotating={true}
              onSend={handleSend}
              onVoiceClick={handleVoiceClick}
              onCameraClick={handleCameraClick}
            />
          </div>
        )}
      </div>

      <VoiceRecordingOverlay
        open={voiceRecActive && !videoRecActive}
        duration={voiceRec.duration}
        level={voiceRec.level}
        paused={voiceRec.paused}
        frozen={voiceRecFrozen}
        avatarUrl={myAvatarUrl}
        onPause={voiceRec.pause}
        onResume={voiceRec.resume}
        onSend={sendVoiceNow}
        onCancel={cancelVoiceNow}
      />

      <VideoRecordingOverlay
        open={videoRecActive && !voiceRecActive}
        stream={videoRec.stream}
        duration={videoRec.duration}
        facing={videoRec.facing}
        frozen={false}
        onSwitchCamera={videoRec.switchCamera}
        onSend={sendVideoNow}
        onCancel={cancelVideoNow}
      />

      {activeMessage && pickerAnchor && (
        <ReactionWheel
          open
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
          boundsRef={messagesContainerRef}
          reactions={activeMessage.reactions || {}}
          nickname={myId}
          onPick={(emoji) => sendReaction(activeMessage.id, emoji)}
          onClose={() => setPickerFor(null)}
        />
      )}

      <MessageActionsMenu
        open={!!actionsMenu}
        anchor={actionsMenu?.anchor}
        container={actionsMenu?.container}
        isOwn={actionsMenu?.msg?.senderId === myId}
        isAdmin={false}
        isSticker={!!actionsMenu?.msg?.stickerUrl}
        stickerUrl={actionsMenu?.msg?.stickerUrl || null}
        isFavorite={actionsMenu?.msg?.stickerUrl ? favoriteSet.has(actionsMenu.msg.stickerUrl) : false}
        onForward={() => {
          if (actionsMenu?.msg && onForward) {
            onForward(buildForwardData(actionsMenu.msg));
          }
        }}
        onEdit={undefined}
        onDelete={() => {
          if (actionsMenu?.msg) {
            setConfirmDelete({ messageId: actionsMenu.msg.id });
          }
        }}
        onToggleFavorite={
          onToggleFavorite && actionsMenu?.msg?.stickerUrl
            ? () => onToggleFavorite(actionsMenu.msg.stickerUrl)
            : undefined
        }
        isInStorage={
          actionsMenu?.msg ? storageSourceIds.has(actionsMenu.msg.id) : false
        }
        onSaveToStorage={
          onSaveToStorage && actionsMenu?.msg
            ? () => {
              const { type, payload, source } = buildStorageData(actionsMenu.msg);
              onSaveToStorage(type, payload, source);
            }
            : undefined
        }
        onClose={closeActionsMenu}
      />

      <ConfirmModal
        open={!!confirmDelete}
        title="Удалить сообщение?"
        description="Вы подтверждаете удаление этого сообщения?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <StickerPanel
        open={stickerPanelOpen}
        onClose={() => setStickerPanelOpen(false)}
        stickers={stickers}
        onPick={handleStickerPick}
        isAdmin={isAdmin}
        token={token}
        onUploaded={onStickersUpdated}
        favoriteStickers={favoriteStickers}
        onToggleFavorite={onToggleFavorite}
      />

      {fullscreenImage && (
        <div className="private-image-overlay" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="" className="private-image-full" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="private-image-close" onClick={() => setFullscreenImage(null)} aria-label="Закрыть">✕</button>
        </div>
      )}
    </>
  );
};

export default PrivateChat;