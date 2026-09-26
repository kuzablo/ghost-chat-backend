import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { getAvatarColor, getInitial, formatMessageDate, formatDateDivider, isNewDay } from '../utils';
import ConfirmModal from './ConfirmModal';
import MessageActionsMenu from './MessageActionsMenu';
import ReactionWheel from './ReactionWheel';
import VoiceMessage from './VoiceMessage';
import VideoMessage from './VideoMessage';
import VideoAttachment from './VideoAttachment';
import SmartImage from './SmartImage';
import Avatar from './Avatar';

const DOUBLE_TAP_MS = 250;
const LONG_PRESS_MENU_MS = 500;
const AVATAR_LONG_PRESS_MS = 250;
const AVATAR_MOVE_CANCEL_PX = 8;

const MessageList = ({
  messages,
  isAdmin,
  deleteMessage,
  toggleReactions,
  activeMessageId,
  setActiveMessageId,
  nickname,
  sendReaction,
  setFullscreenImage,
  messagesEndRef,
  myId,
  onEditMessage,
  containerRef,
  onReply,
  onForward,
  onOpenProfile,
  avatarByUser = {},
  bannedUsers = new Set(),
  favoriteStickers = [],
  onToggleFavorite,
  storageSourceIds = new Set(),
  onSaveToStorage,
}) => {
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [poppingId, setPoppingId] = useState(null);
  const [actionsMenu, setActionsMenu] = useState(null);
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const [avatarRingId, setAvatarRingId] = useState(null);

  const swipeRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    direction: null,
    cardEl: null,
    replyGlowEl: null,
    deleteGlowEl: null,
    ready: false,
    msg: null,
  });
  const swipeActiveRef = useRef(false);

  const [editRingId, setEditRingId] = useState(null);
  const longPressRef = useRef({ timer: null, ringTimer: null, completedAt: 0 });
  const LONG_PRESS_IGNORE_MS = 500;
  const RING_START_DELAY = 200;

  const avatarRingRef = useRef({ timer: null, startX: 0, startY: 0, activeId: null });

  const tapTimerRef = useRef(null);
  const lastTapRef = useRef({ id: null, time: 0, x: 0, y: 0 });
  const [heartBurst, setHeartBurst] = useState(null);

  const editTextareaRef = useRef(null);

  const favoriteSet = useMemo(
    () => new Set(Array.isArray(favoriteStickers) ? favoriteStickers : []),
    [favoriteStickers]
  );

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (avatarRingRef.current.timer) clearTimeout(avatarRingRef.current.timer);
    };
  }, []);

  useEffect(() => {
    if (!activeMessageId) setPickerAnchor(null);
  }, [activeMessageId]);

  useEffect(() => {
    const el = editTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [editText, editingMessageId]);

  const startEdit = (message) => {
    if (message?.stickerUrl) return;
    if (message?.videoUrl) return;
    setEditingMessageId(message.id);
    setEditText(message.text || '');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
    setIsEditing(false);
  };

  const saveEdit = (messageId) => {
    const original = messages.find(m => m.id === messageId);
    const nextText = editText.trim();
    const changed = nextText !== (original?.text || '');
    const allowed = nextText.length > 0 || !!original?.imageUrl;
    if (changed && allowed) onEditMessage(messageId, nextText);
    cancelEdit();
  };

  const handleConfirmDelete = () => {
    if (confirmData) {
      deleteMessage(confirmData.messageId);
      setConfirmData(null);
    }
  };

  const hasReactions = (message) => message?.reactions && Object.keys(message.reactions).length > 0;
  const canDelete = (m) => isAdmin || m.userId === myId;

  const handleImageTap = (e, m) => {
    e.stopPropagation();
    if (swipeActiveRef.current) return;
    if (Date.now() - longPressRef.current.completedAt < LONG_PRESS_IGNORE_MS) return;

    const now = Date.now();
    const last = lastTapRef.current;
    const parent = e.currentTarget.parentElement;
    const rect = (parent || e.currentTarget).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const isDouble =
      last.id === m.id &&
      now - last.time < DOUBLE_TAP_MS &&
      Math.abs(x - last.x) < 40 &&
      Math.abs(y - last.y) < 40;

    if (isDouble) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = { id: null, time: 0, x: 0, y: 0 };
      const alreadyHeart = m.reactions?.['❤️']?.includes(nickname);
      if (!alreadyHeart) sendReaction(m.id, '❤️');
      setHeartBurst({ id: m.id, x, y, key: now });
      setTimeout(() => {
        setHeartBurst(prev => (prev && prev.key === now ? null : prev));
      }, 800);
      return;
    }

    lastTapRef.current = { id: m.id, time: now, x, y };
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      setFullscreenImage({ url: m.imageUrl, messageId: m.id });
    }, DOUBLE_TAP_MS);
  };

  const handleMessageTap = (messageId, e) => {
    if (actionsMenu) { setActionsMenu(null); return; }
    if (activeMessageId === messageId) { toggleReactions(messageId); return; }

    setPoppingId(messageId);
    setTimeout(() => setPoppingId(null), 380);

    if (e && typeof e.clientX === 'number') {
      setPickerAnchor({ x: e.clientX, y: e.clientY });
    } else {
      setPickerAnchor(null);
    }

    toggleReactions(messageId);
  };

  const handleQuoteClick = (replyId, e) => {
    if (e) e.stopPropagation();
    if (!replyId) return;
    const container = containerRef?.current;
    if (!container) return;
    const el = container.querySelector(`[data-msg-id="${replyId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg--highlight');
    setTimeout(() => el.classList.remove('msg--highlight'), 1600);
  };

  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 80;
  const DIRECTION_LOCK = 8;

  const cancelLongPress = () => {
    if (longPressRef.current.timer) { clearTimeout(longPressRef.current.timer); longPressRef.current.timer = null; }
    if (longPressRef.current.ringTimer) { clearTimeout(longPressRef.current.ringTimer); longPressRef.current.ringTimer = null; }
    setEditRingId(null);
  };

  const resetSwipeVisual = (cardEl, replyGlowEl, deleteGlowEl) => {
    if (cardEl) {
      cardEl.style.transition = 'transform 0.2s ease-out';
      cardEl.style.transform = '';
      cardEl.classList.remove('msg-content--ready-reply');
      cardEl.classList.remove('msg-content--ready-delete');
      setTimeout(() => { if (cardEl) cardEl.style.transition = ''; }, 220);
    }
    if (replyGlowEl) replyGlowEl.style.opacity = '0';
    if (deleteGlowEl) deleteGlowEl.style.opacity = '0';
  };

  const openActionsMenuFor = (m, touchTargetEl) => {
    const containerEl = containerRef?.current;
    if (!containerEl) return;
    const cardEl = touchTargetEl || null;
    const target = cardEl && cardEl.closest('.msg') ? cardEl.closest('.msg') : cardEl;
    const rect = (target || containerEl).getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    setActionsMenu({
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      container: {
        top: containerRect.top,
        left: containerRect.left,
        right: containerRect.right,
        bottom: containerRect.bottom,
      },
      msg: m,
    });
  };

  const closeActionsMenu = () => setActionsMenu(null);

  const buildForwardData = (m) => {
    const forwardedFrom = m.forwardedFrom
      ? m.forwardedFrom
      : { nickname: m.nickname, originalId: m.id, originalTime: m.time, fromPrivate: false };
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

    const source = {
      nickname: m.nickname,
      messageId: m.id,
      originalTime: m.time,
      fromPrivate: false,
    };

    return { type, payload, source };
  };

  const handleMsgTouchStart = (e, m) => {
    if (e.touches.length !== 1) return;
    if (editingMessageId === m.id) return;
    if (actionsMenu) return;

    const t = e.touches[0];
    const card = e.currentTarget;
    const msgEl = card.closest('.msg');
    const replyGlow = msgEl?.querySelector('.msg-swipe-glow--reply') || null;
    const deleteGlow = msgEl?.querySelector('.msg-swipe-glow--delete') || null;

    const r = swipeRef.current;
    r.active = true;
    r.startX = t.clientX;
    r.startY = t.clientY;
    r.direction = null;
    r.cardEl = card;
    r.replyGlowEl = replyGlow;
    r.deleteGlowEl = deleteGlow;
    r.ready = false;
    r.msg = m;
    swipeActiveRef.current = false;

    if (card) { card.style.transition = 'none'; card.style.transform = ''; }

    longPressRef.current.ringTimer = setTimeout(() => {
      longPressRef.current.ringTimer = null;
      setEditRingId(m.id);
    }, RING_START_DELAY);

    longPressRef.current.timer = setTimeout(() => {
      longPressRef.current.timer = null;
      longPressRef.current.completedAt = Date.now();
      setEditRingId(null);
      swipeActiveRef.current = true;
      if (card) { card.style.transform = ''; card.style.transition = ''; }
      openActionsMenuFor(m, card);
    }, LONG_PRESS_MENU_MS);
  };

  const handleMsgTouchMove = (e, m) => {
    const r = swipeRef.current;
    if (!r.active) return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - r.startX;
    const dy = t.clientY - r.startY;

    if (!r.direction) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      cancelLongPress();

      if (Math.abs(dy) > Math.abs(dx)) { r.active = false; r.cardEl = null; return; }
      if (dx > 0 && !canDelete(m)) { r.active = false; r.cardEl = null; return; }

      r.direction = dx < 0 ? 'reply' : 'delete';
      swipeActiveRef.current = true;

      if (setActiveMessageId) setActiveMessageId(prev => prev == null ? prev : null);
    }

    if (e.cancelable) e.preventDefault();

    let off;
    if (r.direction === 'reply') {
      off = Math.min(0, Math.max(dx, -SWIPE_MAX));
      if (r.cardEl) {
        r.cardEl.style.transition = 'none';
        r.cardEl.style.transform = `translateX(${off}px)`;
      }
      if (r.replyGlowEl) {
        r.replyGlowEl.style.opacity = String(Math.min(Math.abs(off) / SWIPE_THRESHOLD, 1));
      }
    } else if (r.direction === 'delete') {
      off = Math.max(0, Math.min(dx, SWIPE_MAX));
      if (r.cardEl) {
        r.cardEl.style.transition = 'none';
        r.cardEl.style.transform = `translateX(${off}px)`;
      }
      if (r.deleteGlowEl) {
        r.deleteGlowEl.style.opacity = String(Math.min(Math.abs(off) / SWIPE_THRESHOLD, 1));
      }
    } else {
      off = 0;
    }

    const nextReady = Math.abs(off) >= SWIPE_THRESHOLD;
    if (nextReady !== r.ready) {
      r.ready = nextReady;
      if (r.cardEl) {
        if (r.direction === 'reply') r.cardEl.classList.toggle('msg-content--ready-reply', nextReady);
        else if (r.direction === 'delete') r.cardEl.classList.toggle('msg-content--ready-delete', nextReady);
      }
    }
  };

  const handleMsgTouchEnd = (e, m) => {
    cancelLongPress();
    const r = swipeRef.current;
    if (!r.active && !r.cardEl) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - r.startX;
    const dir = r.direction;
    const cardEl = r.cardEl;
    const replyGlowEl = r.replyGlowEl;
    const deleteGlowEl = r.deleteGlowEl;

    r.active = false; r.direction = null; r.cardEl = null;
    r.replyGlowEl = null; r.deleteGlowEl = null; r.ready = false; r.msg = null;

    if (dir === 'reply' && dx <= -SWIPE_THRESHOLD && onReply) {
      resetSwipeVisual(cardEl, replyGlowEl, deleteGlowEl);
      onReply(m);
    } else if (dir === 'delete' && dx >= SWIPE_THRESHOLD && canDelete(m)) {
      resetSwipeVisual(cardEl, replyGlowEl, deleteGlowEl);
      setConfirmData({ messageId: m.id });
    } else {
      resetSwipeVisual(cardEl, replyGlowEl, deleteGlowEl);
    }

    setTimeout(() => { swipeActiveRef.current = false; }, 50);
  };

  const handleMsgClick = (e, m) => {
    if (actionsMenu) { setActionsMenu(null); return; }
    if (swipeActiveRef.current) return;
    if (Date.now() - longPressRef.current.completedAt < LONG_PRESS_IGNORE_MS) return;
    if (e.target.closest('.video-msg')) return;
    if (e.target.closest('.video-attachment')) return;
    if (e.target.closest('.voice-msg')) return;
    handleMessageTap(m.id, e);
  };

  // ===== AVATAR LONG-PRESS → ПРОФИЛЬ =====

  const handleAvatarTouchStart = (e, msgId, userId, nick) => {
    if (e.touches.length !== 1) return;
    if (!onOpenProfile) return;
    if (!userId) return;
    const t = e.touches[0];
    avatarRingRef.current.startX = t.clientX;
    avatarRingRef.current.startY = t.clientY;
    avatarRingRef.current.activeId = msgId;

    setAvatarRingId(msgId);
    if (avatarRingRef.current.timer) clearTimeout(avatarRingRef.current.timer);
    avatarRingRef.current.timer = setTimeout(() => {
      avatarRingRef.current.timer = null;
      setAvatarRingId(null);
      avatarRingRef.current.activeId = null;
      onOpenProfile(userId, nick);
    }, AVATAR_LONG_PRESS_MS);
  };

  const handleAvatarTouchMove = (e) => {
    if (!avatarRingRef.current.timer) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - avatarRingRef.current.startX);
    const dy = Math.abs(t.clientY - avatarRingRef.current.startY);
    if (dx > AVATAR_MOVE_CANCEL_PX || dy > AVATAR_MOVE_CANCEL_PX) {
      if (avatarRingRef.current.timer) {
        clearTimeout(avatarRingRef.current.timer);
        avatarRingRef.current.timer = null;
      }
      setAvatarRingId(null);
      avatarRingRef.current.activeId = null;
    }
  };

  const handleAvatarTouchEnd = () => {
    if (avatarRingRef.current.timer) {
      clearTimeout(avatarRingRef.current.timer);
      avatarRingRef.current.timer = null;
    }
    setAvatarRingId(null);
    avatarRingRef.current.activeId = null;
  };

  const renderMsgAvatar = (userId, nick, msgId) => {
    const url = avatarByUser[userId];
    const isBanned = bannedUsers.has(userId);
    const isRingOn = avatarRingId === msgId;
    return (
      <Avatar
        src={url}
        nickname={nick}
        className={`msg-avatar${isBanned ? ' msg-avatar--banned' : ''}`}
        alt=""
        onTouchStart={(e) => handleAvatarTouchStart(e, msgId, userId, nick)}
        onTouchMove={handleAvatarTouchMove}
        onTouchEnd={handleAvatarTouchEnd}
        onTouchCancel={handleAvatarTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isRingOn && <span className="msg-avatar-hold-ring" aria-hidden="true" />}
        {isBanned && <span className="msg-avatar-banned-badge" aria-hidden="true">🚫</span>}
      </Avatar>
    );
  };

  const sameMinute = (t1, t2) => {
    const d1 = new Date(t1); const d2 = new Date(t2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate() &&
      d1.getHours() === d2.getHours() &&
      d1.getMinutes() === d2.getMinutes()
    );
  };

  const isGroupable = (a, b) => {
    if (!a || !b) return false;
    if (a.userId !== b.userId) return false;
    if (!sameMinute(a.time, b.time)) return false;
    if (b.replyTo) return false;
    if (editingMessageId && (a.id === editingMessageId || b.id === editingMessageId)) return false;
    const aImageOnly = !a.text?.trim() && !!a.imageUrl;
    const bImageOnly = !b.text?.trim() && !!b.imageUrl;
    if (aImageOnly || bImageOnly) return false;
    if (a.stickerUrl || b.stickerUrl) return false;
    if (a.voiceUrl || b.voiceUrl) return false;
    if (a.videoUrl || b.videoUrl) return false;
    return true;
  };

  const renderForwardLabel = (m) => {
    if (!m.forwardedFrom) return null;
    const ff = m.forwardedFrom;
    return (
      <div className="msg-forward-label">
        <span className="msg-forward-arrow">↪</span>
        <span className="msg-forward-nick">Переслано от {ff.nickname}</span>
        {ff.originalTime && (
          <span className="msg-forward-time">· {formatMessageDate(ff.originalTime)}</span>
        )}
      </div>
    );
  };

  const activeMessage = activeMessageId
    ? messages.find(x => x.id === activeMessageId)
    : null;

  return (
    <>
      <div className="messages" ref={containerRef}>
        {messages.map((m, i) => {
          const isOwn = m.userId === myId;
          const isEditingThis = editingMessageId === m.id;
          const isSticker = !!m.stickerUrl;
          const isImageOnly = !isSticker && !m.text?.trim() && !!m.imageUrl && !isEditingThis;
          const isVoiceOnly = !isSticker && !m.text?.trim() && !m.imageUrl && !!m.voiceUrl;
          const isVideoOnly = !isSticker && !m.text?.trim() && !m.imageUrl && !m.voiceUrl && !!m.videoUrl;
          const prevMessage = messages[i - 1];
          const nextMessage = messages[i + 1];
          const showDateDivider = isNewDay(prevMessage?.time, m.time);
          const isGroupStart = !isGroupable(prevMessage, m);
          const isGroupEnd = !isGroupable(m, nextMessage);
          const isInGroup = !isGroupStart || !isGroupEnd;

          const dateDivider = showDateDivider ? (
            <div className="date-divider" key={`date-${m.id}`}>
              <span>{formatDateDivider(m.time)}</span>
            </div>
          ) : null;

          const forwardLabel = renderForwardLabel(m);

          if (isSticker) {
            return (
              <React.Fragment key={m.id}>
                {dateDivider}
                <div className={`msg msg--sticker ${isOwn ? 'msg--own' : 'msg--other'}`} data-msg-id={m.id}>
                  {renderMsgAvatar(m.userId, m.nickname, m.id)}
                  <div className="msg-swipe-glow msg-swipe-glow--reply" />
                  <div className="msg-swipe-glow msg-swipe-glow--delete" />
                  <div
                    className="msg-sticker-wrap"
                    onTouchStart={(e) => handleMsgTouchStart(e, m)}
                    onTouchMove={(e) => handleMsgTouchMove(e, m)}
                    onTouchEnd={(e) => handleMsgTouchEnd(e, m)}
                  >
                    {editRingId === m.id && <div className="hold-ring" />}
                    {forwardLabel}
                    <div className="msg-sticker-nick">{m.nickname}</div>
                    <SmartImage
                      src={m.stickerUrl}
                      alt=""
                      wrapperClassName="msg-sticker-smart"
                      imgClassName="msg-sticker-img"
                      fit="contain"
                    />
                  </div>
                </div>
              </React.Fragment>
            );
          }

          const replyBlock = m.replyTo ? (
            <div
              className="msg-reply-quote"
              onClick={(e) => handleQuoteClick(m.replyTo.id, e)}
              onTouchStart={(e) => e.stopPropagation()}
              role="button"
              tabIndex={0}
            >
              <div className="msg-reply-quote-nick">{m.replyTo.nickname}</div>
              <div className="msg-reply-quote-text">
                {m.replyTo.text || (m.replyTo.imageUrl ? '📷 фото' : '')}
              </div>
            </div>
          ) : null;

          const heartBurstNode = heartBurst && heartBurst.id === m.id ? (
            <span key={heartBurst.key} className="msg-heart-burst" style={{ left: heartBurst.x, top: heartBurst.y }}>
              ❤️
            </span>
          ) : null;

          if (isVoiceOnly) {
            return (
              <React.Fragment key={m.id}>
                {dateDivider}
                <div className={`msg msg--voice-only ${isOwn ? 'msg--own' : 'msg--other'}`} data-msg-id={m.id}>
                  {renderMsgAvatar(m.userId, m.nickname, m.id)}
                  <div className="msg-swipe-glow msg-swipe-glow--reply" />
                  <div className="msg-swipe-glow msg-swipe-glow--delete" />
                  <div
                    className="msg-voice-wrap"
                    onTouchStart={(e) => handleMsgTouchStart(e, m)}
                    onTouchMove={(e) => handleMsgTouchMove(e, m)}
                    onTouchEnd={(e) => handleMsgTouchEnd(e, m)}
                  >
                    {editRingId === m.id && <div className="hold-ring" />}
                    {forwardLabel}
                    <div className="msg-voice-header">
                      <span className="msg-nick">{m.nickname}</span>
                      <span className="msg-time">{formatMessageDate(m.time)}</span>
                    </div>
                    {replyBlock}
                    <VoiceMessage
                      url={m.voiceUrl}
                      duration={m.voiceDuration || 0}
                      waveform={m.voiceWaveform || []}
                      isOwn={isOwn}
                    />
                  </div>
                </div>
              </React.Fragment>
            );
          }

          if (isVideoOnly) {
            return (
              <React.Fragment key={m.id}>
                {dateDivider}
                <div className={`msg msg--video-only ${isOwn ? 'msg--own' : 'msg--other'}`} data-msg-id={m.id}>
                  {renderMsgAvatar(m.userId, m.nickname, m.id)}
                  <div className="msg-swipe-glow msg-swipe-glow--reply" />
                  <div className="msg-swipe-glow msg-swipe-glow--delete" />
                  <div
                    className="msg-video-wrap"
                    onTouchStart={(e) => handleMsgTouchStart(e, m)}
                    onTouchMove={(e) => handleMsgTouchMove(e, m)}
                    onTouchEnd={(e) => handleMsgTouchEnd(e, m)}
                  >
                    {editRingId === m.id && <div className="hold-ring" />}
                    {forwardLabel}
                    <div className="msg-voice-header">
                      <span className="msg-nick">{m.nickname}</span>
                      <span className="msg-time">{formatMessageDate(m.time)}</span>
                    </div>
                    {m.isCircle ? (
                      <VideoMessage
                        url={m.videoUrl}
                        isOwn={isOwn}
                        createdAt={m.time}
                        messageId={m.id}
                        reactions={m.reactions || {}}
                        nickname={nickname}
                        onReact={sendReaction}
                      />
                    ) : (
                      <VideoAttachment
                        url={m.videoUrl}
                        isOwn={isOwn}
                        messageId={m.id}
                        reactions={m.reactions || {}}
                        nickname={nickname}
                        onReact={sendReaction}
                      />
                    )}
                    {hasReactions(m) && (
                      <div className="msg-video-reactions">
                        {Object.entries(m.reactions).map(([emoji, users]) => (
                          <span
                            key={emoji}
                            className={`msg-video-reaction-badge ${users.includes(nickname) ? 'own' : ''}`}
                          >
                            {emoji}
                            {users.length > 1 && (
                              <span className="msg-video-reaction-count">{users.length}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          }

          if (isImageOnly) {
            return (
              <React.Fragment key={m.id}>
                {dateDivider}
                <div className={`msg msg--image-only ${isOwn ? 'msg--own' : 'msg--other'}`} data-msg-id={m.id}>
                  {renderMsgAvatar(m.userId, m.nickname, m.id)}
                  <div className="msg-swipe-glow msg-swipe-glow--reply" />
                  <div className="msg-swipe-glow msg-swipe-glow--delete" />
                  <div className="msg-content msg-content--image-only">
                    <div
                      className="msg-image-only-wrap"
                      onTouchStart={(e) => handleMsgTouchStart(e, m)}
                      onTouchMove={(e) => handleMsgTouchMove(e, m)}
                      onTouchEnd={(e) => handleMsgTouchEnd(e, m)}
                    >
                      {editRingId === m.id && <div className="msg-edit-ring" />}
                      {replyBlock && <div className="msg-image-only-reply-wrap">{replyBlock}</div>}
                      <SmartImage
                        src={m.imageUrl}
                        alt="photo"
                        wrapperClassName="msg-image-only-smart"
                        imgClassName="msg-image-only-img"
                        draggable={false}
                        onClick={(e) => handleImageTap(e, m)}
                      />
                      {heartBurstNode}
                      <div className="msg-image-overlay">
                        <span className="msg-nick msg-nick--overlay">{m.nickname}</span>
                        {forwardLabel}
                      </div>
                      <div className="msg-image-bottom-overlay">
                        <span className="msg-time msg-time--bottom">{formatMessageDate(m.time)}</span>
                      </div>
                    </div>

                    {hasReactions(m) && (
                      <div className={`msg-image-only-reactions ${activeMessageId === m.id ? 'msg-image-only-reactions--above-picker' : ''}`}>
                        {Object.entries(m.reactions).map(([emoji, users]) => (
                          <span key={emoji} className={`image-only-reaction-badge ${users.includes(nickname) ? 'own' : ''}`}>
                            {emoji}
                            {users.length > 1 && (<span className="image-only-reaction-count">{users.length}</span>)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={m.id}>
              {dateDivider}
              <div
                className={[
                  'msg',
                  isOwn ? 'msg--own' : 'msg--other',
                  isInGroup ? 'msg--in-group' : '',
                  isGroupStart ? 'msg--group-start' : '',
                  isGroupEnd ? 'msg--group-end' : '',
                ].filter(Boolean).join(' ')}
                data-msg-id={m.id}
              >
                {isGroupStart ? renderMsgAvatar(m.userId, m.nickname, m.id) : (
                  <div className="msg-avatar msg-avatar--placeholder" />
                )}
                <div className="msg-swipe-glow msg-swipe-glow--reply" />
                <div className="msg-swipe-glow msg-swipe-glow--delete" />

                <div
                  className={`msg-content ${poppingId === m.id ? 'msg-content--pop' : ''} ${activeMessageId === m.id ? 'msg-content--picker-open' : ''} ${isEditingThis ? 'msg-content--editing' : ''}`}
                  onClick={(e) => handleMsgClick(e, m)}
                  onTouchStart={(e) => handleMsgTouchStart(e, m)}
                  onTouchMove={(e) => handleMsgTouchMove(e, m)}
                  onTouchEnd={(e) => handleMsgTouchEnd(e, m)}
                >
                  {editRingId === m.id && <div className="msg-edit-ring" />}

                  {isGroupStart && (
                    <div className="msg-header">
                      <span className="msg-nick">{m.nickname}</span>
                      <span className="msg-time">{formatMessageDate(m.time)}</span>
                    </div>
                  )}

                  {forwardLabel}
                  {replyBlock}

                  {isEditingThis ? (
                    <div className="msg-edit-area">
                      <textarea
                        ref={editTextareaRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="msg-edit-input msg-edit-textarea"
                        rows={1}
                        inputMode="text"
                        enterKeyHint="done"
                      />
                      <div className="msg-edit-actions">
                        <button className="btn msg-edit-btn msg-edit-btn--cancel" onClick={(e) => { e.stopPropagation(); cancelEdit(); }}>Отмена</button>
                        <button className="btn msg-edit-btn msg-edit-btn--save" onClick={(e) => { e.stopPropagation(); saveEdit(m.id); }}>Сохранить</button>
                      </div>
                    </div>
                  ) : (
                    m.text ? <div className="msg-text">{m.text}</div> : null
                  )}

                  {m.imageUrl && (
                    <div className="msg-image-wrapper">
                      <SmartImage
                        src={m.imageUrl}
                        alt="photo"
                        wrapperClassName="msg-image-smart"
                        imgClassName="msg-image"
                        draggable={false}
                        onClick={(e) => handleImageTap(e, m)}
                      />
                      {heartBurstNode}
                    </div>
                  )}

                  {hasReactions(m) && (
                    <div className={`msg-reactions ${activeMessageId === m.id ? 'msg-reactions--above-picker' : ''}`}>
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <span key={emoji} className={`msg-reaction-badge ${users.includes(nickname) ? 'own' : ''}`}>
                          {emoji}
                          {users.length > 1 && (<span className="msg-reaction-count">{users.length}</span>)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {activeMessage && pickerAnchor && (
        <ReactionWheel
          open
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
          boundsRef={containerRef}
          reactions={activeMessage.reactions || {}}
          nickname={nickname}
          onPick={(emoji) => {
            sendReaction(activeMessage.id, emoji);
            toggleReactions(activeMessage.id);
          }}
          onClose={() => toggleReactions(activeMessage.id)}
        />
      )}

      <MessageActionsMenu
        open={!!actionsMenu}
        anchor={actionsMenu?.anchor}
        container={actionsMenu?.container}
        isOwn={actionsMenu?.msg?.userId === myId}
        isAdmin={isAdmin}
        isSticker={!!actionsMenu?.msg?.stickerUrl || !!actionsMenu?.msg?.videoUrl}
        stickerUrl={actionsMenu?.msg?.stickerUrl || null}
        isFavorite={
          actionsMenu?.msg?.stickerUrl
            ? favoriteSet.has(actionsMenu.msg.stickerUrl)
            : false
        }
        onForward={() => { if (actionsMenu?.msg && onForward) onForward(buildForwardData(actionsMenu.msg)); }}
        onEdit={() => { if (actionsMenu?.msg) startEdit(actionsMenu.msg); }}
        onDelete={() => { if (actionsMenu?.msg) setConfirmData({ messageId: actionsMenu.msg.id }); }}
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
        open={!!confirmData}
        title="Удалить сообщение?"
        description="Вы подтверждаете удаление этого сообщения?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmData(null)}
      />
    </>
  );
};

export default memo(MessageList);