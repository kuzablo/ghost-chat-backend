import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { VERSION } from '../version';
import PrivateChat from './components/PrivateChat';
import PlayersPanel from './components/PlayersPanel';
import AuthModal from './components/AuthModal';
import MessageList from './components/MessageList';
import DuelBox from './components/DuelBox';
import InfoPanel from './components/InfoPanel';
import DialogsPanel from './components/DialogsPanel';
import ConfirmModal from './components/ConfirmModal';
import ChatInput from './components/ChatInput';
import InputActionButtons from './components/InputActionButtons';
import NotificationPermissionModal from './components/NotificationPermissionModal';
import ProfilePanel from './components/ProfilePanel';
import FriendshipRitual from './components/FriendshipRitual';
import RoomPulse from './components/RoomPulse';
import StickerPanel from './components/StickerPanel';
import PrivateMessageToasts from './components/PrivateMessageToasts';
import ForwardPickerModal from './components/ForwardPickerModal';
import ReactionWheel from './components/ReactionWheel';
import UpdateToast from './components/UpdateToast';
import StoragePanel from './components/StoragePanel';
import SendingIndicator from './components/SendingIndicator';
import StorageToast from './components/StorageToast';
import { useStorage } from './hooks/useStorage';
import { QRCodeSVG } from 'qrcode.react';
import { useWebSocket } from './useWebSocket';
import { getAvatarColor, getInitial, formatMessageDate } from './utils';
import { useAudio } from './hooks/useAudio';
import { useChatUI } from './hooks/useChatUI';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAuth } from './hooks/useAuth';
import { useDuel } from './hooks/useDuel';
import { usePrivateChat } from './hooks/usePrivateChat';
import { useChat } from './hooks/useChat';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useMascotGestures } from './hooks/useMascotGestures';
import { useCapsuleGestures } from './hooks/useCapsuleGestures';
import { useFullscreenGestures } from './hooks/useFullscreenGestures';
import { useMascotFlight } from './hooks/useMascotFlight';
import InstallPwaBanner from './components/InstallPwaBanner';
import InstallPwaBannerAndroid from './components/InstallPwaBannerAndroid';
import VoiceRecordingOverlay from './components/VoiceRecordingOverlay';
import VideoRecordingOverlay from './components/VideoRecordingOverlay';
import { useVoiceRecorder, extFromMime } from './hooks/useVoiceRecorder';
import { useVideoRecorder, extFromVideoMime } from './hooks/useVideoRecorder';

import '../styles/Chat.css';
import '../styles/Chat.image.css';
import '../styles/Chat.players.css';
import '../styles/Chat.private.css';
import '../styles/Chat.modals.css';
import '../styles/Chat.mobile.css';
import '../styles/Chat.mascot.css';
import '../styles/Chat.info.css';
import '../styles/Chat.dialogs.css';
import '../styles/Chat.stickers.css';
import '../styles/Chat.profile.css';
import '../styles/Chat.friendship.css';
import '../styles/Chat.roompulse.css';
import '../styles/Chat.instagram.css';
import '../styles/Chat.toasts.css';
import '../styles/Chat.update.css';
import '../styles/Chat.input.css';
import '../styles/Chat.video.css';
import '../styles/Chat.sending.css';

// [2.42.14] VERSION импортируется из ../version — единый источник.
// fix(input): mic/cam без long-press, разрешения сразу, вращающийся ОТПРАВИТЬ (v2.42.3)
// feat(video): кружки (v2.42.0)
const WS_URL = 'wss://api.banjoboy420.ru';
const API_URL = 'https://api.banjoboy420.ru';
const BASE_TITLE = "banjoboy's crew";
const NOTIF_SNOOZE_MS = 24 * 60 * 60 * 1000;
const VAPID_PUBLIC_KEY = 'BJVBCXRoQMBcgEAIrgMo8Wrs7wG_jCjriBY6yS7EkST7EyOhB7ohpMrbujcLtUPjAo7GcKB0Z7Jin-5Uj450muo';
const UPDATE_DEFER_MS = 10 * 60 * 1000;
const TOAST_LIFETIME_MS = 8000;
const MASCOT_SIZE_PANEL_SOLO = 72;
const MASCOT_SIZE_PANEL_ORBIT = 41;
const MASCOT_SIZE_CENTER = 82;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
};

const RefreshIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);


const ThemeIcon = () => (
  <span className="theme-icon" aria-hidden="true">
    <svg className="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
    <svg className="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </span>
);

let __chatRenderStartLogged = false;

const Chat = () => {
  if (!__chatRenderStartLogged
    && typeof window !== 'undefined'
    && typeof window.__clientLog === 'function') {
    __chatRenderStartLogged = true;
    window.__clientLog('chat-render-start', 'Chat body entered (first render)');
  }
  const auth = useAuth();
  const {
    token, nickname, isAuth, isAdmin, myId,
    adminUserId, adminNickname,
    isRegisterMode, setIsRegisterMode,
    authNickname, setAuthNickname,
    authPassword, setAuthPassword,
    authError, setAuthError,
    showPassword, setShowPassword,
    showIdleNotice,
    handleAuthSubmit,
    applyAuthOk,
    forceLogout,
    nicknameRef,
    tokenRef,
  } = auth;

  const {
    toggleTheme,
    activeMessageId,
    setActiveMessageId,
    toggleReactions,
    showPlayers, setShowPlayers,
    showInfo, setShowInfo,
    searchQuery, setSearchQuery,
    banConfirm, setBanConfirm,
    fullscreenImage, setFullscreenImage,
    showFullscreenReactions, setShowFullscreenReactions,
    closeFullscreen,
    showMobileInput, setShowMobileInput,
  } = useChatUI();

  const [isConnected, setIsConnected] = useState(false);
  const [duelNotice, setDuelNotice] = useState('');
  const [inputDragY, setInputDragY] = useState(0);
  const [trackTitleVisible, setTrackTitleVisible] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [voiceRecActive, setVoiceRecActive] = useState(false);
  const [voiceRecFrozen, setVoiceRecFrozen] = useState(false);
  const [videoRecActive, setVideoRecActive] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const permGrantedRef = useRef(false);

  const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [blockConfirm, setBlockConfirm] = useState(null);
  const [showDialogs, setShowDialogs] = useState(false);
  const [cameFromDialogs, setCameFromDialogs] = useState(false);
  const [profileTarget, setProfileTarget] = useState(null);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [forwardData, setForwardData] = useState(null);
  const [updateDeferred, setUpdateDeferred] = useState(false);

  const playersOverlayRef = useRef(null);
  const playersBtnRef = useRef(null);
  const mobilePlayersBtnRef = useRef(null);
  const headerMascotRef = useRef(null);
  const panelOrbitRef = useRef(null);
  const centerMascotRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const infoPanelRef = useRef(null);

  const swipeStartXRef = useRef(null);
  const swipeStartYRef = useRef(null);
  const swipeActiveRef = useRef(false);
  const swipeDirectionRef = useRef(null);
  const showPlayersRef = useRef(showPlayers);
  const showInfoRef = useRef(showInfo);
  const showDialogsRef = useRef(showDialogs);

  const inputTouchStartYRef = useRef(null);
  const inputTouchStartXRef = useRef(null);
  const inputDragYRef = useRef(0);

  const titleTimeoutRef = useRef(null);

  const yt = useYouTubePlayer();
  const versionCheck = useVersionCheck();
  const {
    volumeTipVisible,
    showMiniPlayer,
    handleMascotPointerDown,
    handleMascotPointerMove,
    handleMascotPointerUp,
    handleMascotContextMenu,
  } = useMascotGestures(yt);

  const {
    flying: mascotFlying,
    startFlight: startMascotFlight,
    cancelFlight: cancelMascotFlight,
  } = useMascotFlight({
    fromRef: headerMascotRef,
    duration: 700,
  });

  const [mascotPlace, setMascotPlace] = useState('header');
  const centerDismissedForCountRef = useRef(null);

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

  const subscribeToPush = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!tokenRef.current) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const res = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenRef.current,
          subscription: sub.toJSON(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[push] subscribe failed:', res.status, data);
      }
    } catch (err) {
      console.warn('[push] subscribe error:', err);
    }
  }, [tokenRef]);

  useEffect(() => {
    if (!isAuth) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    const isMobile = /Android|iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isMobile) return;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (isIos && !isStandalone) return;

    if (Notification.permission === 'granted') {
      subscribeToPush();
      return;
    }

    if (Notification.permission !== 'default') return;

    let snooze = 0;
    try { snooze = Number(localStorage.getItem('ghost-chat-notif-snooze') || 0); } catch { /* noop */ }
    if (Date.now() - snooze < NOTIF_SNOOZE_MS) return;

    const t = setTimeout(() => setShowNotifModal(true), 1500);
    return () => clearTimeout(t);
  }, [isAuth, subscribeToPush]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const onSWMessage = (e) => {
      if (e.data?.type === 'push-received') {
        setHiddenUnread(n => n + 1);
      }
    };

    navigator.serviceWorker.addEventListener('message', onSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSWMessage);
  }, []);

  useEffect(() => {
    if (!yt.hasStarted) return;
    setTrackTitleVisible(true);
    clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => setTrackTitleVisible(false), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yt.trackIndex]);

  const { isConnected: wsConnected, error: wsError, sendMessage } = useWebSocket(
    WS_URL,
    tokenRef.current,
    (msg) => handleWebSocketMessage(msg)
  );

  const audio = useAudio();

  const duel = useDuel({
    sendMessage,
    isAuth,
    onNotice: (text) => {
      setDuelNotice(text);
      setTimeout(() => setDuelNotice(''), 3000);
    },
  });

  const chat = useChat({
    sendMessage,
    isAuth,
    isAdmin,
    myId,
    audio,
    nicknameRef,
    onNotice: (text) => {
      setDuelNotice(text);
      setTimeout(() => setDuelNotice(''), 3000);
    },
  });

  const {
    messages,
    players,
    friends,
    typingUsers,
    friendRequests,
    notices,
    bannedUntil,
    bannedUsers,
    avatarCache,
    friendshipRitual,
    blockedUsers,
    dialogsBg,
    globalDialogsBg,
    setGlobalDialogsBgAdmin,
    stickers,
    favoriteStickers,
    errorMessage,
    setErrorMessage,
    input,
    setInput,
    sending,
    isUploading,
    hiddenUnread,
    setHiddenUnread,
    replyTo,
    setReplyTo,
    profileData,
    isHistoryLoaded,
    isAvatarsLoaded,
    handleWs: handleChatWs,
    handleSendMessage,
    handleEditMessage,
    handleFileUpload,
    handleInputChange,
    sendReaction,
    deleteMessage,
    banForever,
    watchChat,
    handleFriendRequest,
    handleAcceptRequest,
    handleDeclineRequest,
    togglePlayers: chatTogglePlayers,
    clearRitual,
    blockUser,
    unblockUser,
    saveDialogsBg,
    sendSticker,
    setStickersList,
    toggleFavoriteSticker,
  } = chat;

  const priv = usePrivateChat({ sendMessage, myId, players });
  const storage = useStorage({ sendMessage, isAuth });
  const {
    privateChat,
    privateTypingUser,
    unreadByUser,
    dialogs,
    openPrivateChat,
    closePrivateChat,
    handleWs: handlePrivateWs,
  } = priv;

  const {
    messagesContainerRef,
    messagesEndRef,
    showScrollDown,
    scrollToBottom,
  } = useAutoScroll({ messages, resetKey: isAuth });

  const unreadCount = Object.values(unreadByUser).filter(Boolean).length;
  const friendRequestsCount = friendRequests.length;
  const totalNotifications = unreadCount + friendRequestsCount;
  const totalUnread = hiddenUnread + unreadCount + friendRequestsCount;

  const imageMessages = useMemo(
    () => messages.filter(m => m.imageUrl),
    [messages]
  );

  const unreadUserObjects = useMemo(() => {
    const ids = Object.keys(unreadByUser).filter(id => unreadByUser[id]);
    return ids.map(id => {
      const d = dialogs.find(x => x.userId === id);
      return {
        userId: id,
        nickname: d?.nickname || '—',
        avatarUrl: d?.avatarUrl || avatarCache[id] || null,
      };
    });
  }, [unreadByUser, dialogs, avatarCache]);

  const blockedIds = useMemo(
    () => new Set(blockedUsers.map(u => u.userId)),
    [blockedUsers]
  );

  const storageSourceIds = useMemo(() => {
    const s = new Set();
    storage.items.forEach(it => {
      if (it.source?.messageId) s.add(it.source.messageId);
    });
    return s;
  }, [storage.items]);

  const effectiveDialogsBg = dialogsBg || globalDialogsBg || null;

  const currentImageIndex = fullscreenImage
    ? imageMessages.findIndex(m => m.id === fullscreenImage.messageId)
    : -1;
  const currentImageMessage = currentImageIndex >= 0
    ? imageMessages[currentImageIndex]
    : null;
  const hasPrevImage = currentImageIndex > 0;
  const hasNextImage = currentImageIndex >= 0 && currentImageIndex < imageMessages.length - 1;

  const fullscreenMessage = currentImageMessage || null;
  const fullscreenReactions = fullscreenMessage?.reactions || {};
  const fullscreenReactionEntries = Object.entries(fullscreenReactions);

  const fsAuthorAvatarUrl = fullscreenMessage
    ? avatarCache[fullscreenMessage.userId]
    : null;

  const {
    fsImgRef,
    fsOverlayRef,
    fsHeart,
    fsReactionListEmoji,
    setFsReactionListEmoji,
    fsReactionAnchor,
    handleFsTouchStart,
    handleFsTouchMove,
    handleFsTouchEnd,
    handleFsDoubleTap,
    fsGoPrev,
    fsGoNext,
    handleFullscreenReactionToggle,
    handleFullscreenReactionPick,
    handleFullscreenReactionClose,
  } = useFullscreenGestures({
    fullscreenImage,
    setFullscreenImage,
    closeFullscreen,
    showFullscreenReactions,
    setShowFullscreenReactions,
    imageMessages,
    messages,
    nickname,
    sendReaction,
  });

   useEffect(() => {
    const hasUnread = unreadUserObjects.length > 0;
    const modalOpen = showDialogs || privateChat || !!profileTarget || storageOpen;

    if (modalOpen) {
      if (mascotFlying) cancelMascotFlight();
      if (mascotPlace !== 'hidden') setMascotPlace('hidden');
      return;
    }

    if (mascotFlying) return;

    if (mascotPlace === 'hidden') {
      setMascotPlace('header');
      return;
    }

    const wantPanel = showPlayers;
    const centerAlreadyShown =
      centerDismissedForCountRef.current === unreadUserObjects.length;
    const wantCenter = !showPlayers && hasUnread && !centerAlreadyShown;

    if (wantPanel && mascotPlace !== 'panel') {
      setMascotPlace('panel');
      const size = hasUnread ? MASCOT_SIZE_PANEL_ORBIT : MASCOT_SIZE_PANEL_SOLO;

      if (mascotPlace === 'header') {
        startMascotFlight({ toRef: panelOrbitRef, toSize: size });
      } else if (mascotPlace === 'center') {
        startMascotFlight({
          fromRef: centerMascotRef,
          toRef: panelOrbitRef,
          toSize: size,
        });
      } else {
        startMascotFlight({ fromLanded: true, toRef: panelOrbitRef, toSize: size });
      }
      return;
    }

    if (wantCenter && mascotPlace !== 'center') {
      setMascotPlace('center');

      if (mascotPlace === 'header') {
        startMascotFlight({ toRef: centerMascotRef, toSize: MASCOT_SIZE_CENTER });
      } else if (mascotPlace === 'panel') {
        startMascotFlight({
          fromRef: panelOrbitRef,
          fromSize: hasUnread ? MASCOT_SIZE_PANEL_ORBIT : MASCOT_SIZE_PANEL_SOLO,
          toRef: centerMascotRef,
          toSize: MASCOT_SIZE_CENTER,
        });
      } else {
        startMascotFlight({ fromLanded: true, toRef: centerMascotRef, toSize: MASCOT_SIZE_CENTER });
      }
      return;
    }

    if (mascotPlace !== 'header' && !wantPanel && !wantCenter) {
      setMascotPlace('header');
      const fromRef = mascotPlace === 'panel' ? panelOrbitRef : centerMascotRef;
      const fromSize = mascotPlace === 'panel'
        ? (hasUnread ? MASCOT_SIZE_PANEL_ORBIT : MASCOT_SIZE_PANEL_SOLO)
        : null;
      startMascotFlight({ fromRef, fromSize, toRef: headerMascotRef });
    }
  }, [
    showPlayers,
    showDialogs,
    privateChat,
    profileTarget,
    storageOpen,
    unreadUserObjects.length,
    mascotPlace,
    mascotFlying,
    startMascotFlight,
    cancelMascotFlight,
  ]);

  useEffect(() => {
    if (mascotPlace !== 'center') return;
    const t = setTimeout(() => {
      centerDismissedForCountRef.current = unreadUserObjects.length;
      setMascotPlace('header');
      startMascotFlight({ reverse: true });
    }, TOAST_LIFETIME_MS);
    return () => clearTimeout(t);
  }, [mascotPlace, unreadUserObjects.length, startMascotFlight]);

  useEffect(() => {
    if (centerDismissedForCountRef.current !== null
      && centerDismissedForCountRef.current !== unreadUserObjects.length) {
      centerDismissedForCountRef.current = null;
    }
  }, [unreadUserObjects.length]);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ${BASE_TITLE}` : BASE_TITLE;

    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      try {
        if (totalUnread > 0) {
          navigator.setAppBadge(totalUnread);
        } else if ('clearAppBadge' in navigator) {
          navigator.clearAppBadge();
        }
      } catch { /* noop */ }
    }
  }, [totalUnread]);

  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
      if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
        try { navigator.clearAppBadge(); } catch { /* noop */ }
      }
    };
  }, []);

  useEffect(() => { showPlayersRef.current = showPlayers; }, [showPlayers]);
  useEffect(() => { showInfoRef.current = showInfo; }, [showInfo]);
  useEffect(() => { showDialogsRef.current = showDialogs; }, [showDialogs]);

  const handleWebSocketMessage = useCallback((msg) => {

    if (duel.handleWs(msg)) return;
    if (handlePrivateWs(msg)) return;
    if (handleChatWs(msg)) return;
    if (storage.handleWs(msg)) return;

    switch (msg.type) {
      case 'version':
        console.log(`[CHAT v${VERSION}] Server version: ${msg.data}`);
        break;
      case 'auth_ok':
        applyAuthOk(msg.data);
        sendMessage({ type: 'get_friends' });
        break;
      case 'banned_forever':
        forceLogout('У нас тут таких не любят');
        break;
      case 'idle_disconnect':
        forceLogout('Вы были отключены за неактивность. Войдите снова.');
        break;
      default:
        console.warn(`[CHAT v${VERSION}] Unknown message type:`, msg.type);
    }
  }, [sendMessage, applyAuthOk, forceLogout, duel, handlePrivateWs, handleChatWs, storage]);

  useEffect(() => { setIsConnected(wsConnected); }, [wsConnected]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__ready) return;

    if (!isAuth) {
      window.__ready();
      return;
    }
    if (!isHistoryLoaded || !isAvatarsLoaded) return;

    let cancelled = false;

    const urls = Object.values(avatarCache).filter(Boolean);
    const preload = (list, timeoutMs) => new Promise((resolve) => {
      if (!list.length) return resolve();
      let pending = list.length;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const t = setTimeout(finish, timeoutMs);
      list.forEach((u) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          pending--;
          if (pending === 0) { clearTimeout(t); finish(); }
        };
        img.src = u;
      });
    });

    preload(urls, 1500).then(() => {
      if (cancelled) return;
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el2 = messagesContainerRef.current;
        if (el2) el2.scrollTop = el2.scrollHeight;
        window.__ready();
      });
    });

    return () => { cancelled = true; };
  }, [isAuth, isHistoryLoaded, isAvatarsLoaded, avatarCache, messagesContainerRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__ready) return;
    const t = setTimeout(() => {
      if (typeof window.__clientLog === 'function') {
        window.__clientLog('boot-watchdog', 'forcing __ready after 6s');
      }
      window.__ready();
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (wsError) {
      if (wsError === 'banned-forever') {
        forceLogout('У нас тут таких не любят');
        return;
      }
      if (wsError === 'auth-failed' || wsError === 'auth-timeout') {
        forceLogout('Сессия истекла. Войди заново.');
        return;
      }
      setErrorMessage(wsError);
      const timer = setTimeout(() => setErrorMessage(''), 5000);
      return () => clearTimeout(timer);
    } else {
      setErrorMessage('');
    }
  }, [wsError, forceLogout, setErrorMessage]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (playersBtnRef.current?.contains(e.target)) return;
      if (mobilePlayersBtnRef.current?.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sticker-menu-overlay')) return;
      if (e.target.closest && e.target.closest('.theme-toggle')) return;
      if (e.target.closest && e.target.closest('.chat-header-theme')) return;
      if (e.target.closest && e.target.closest('.dialogs-toggle')) return;
      if (e.target.closest && e.target.closest('.pm-orbit')) return;

      if (playersOverlayRef.current && !playersOverlayRef.current.contains(e.target)) {
        setShowPlayers(false);
      }
    };
    if (showPlayers) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showPlayers, setShowPlayers]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    let raf1 = 0;
    let raf2 = 0;
    let lastKb = -1;

    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable === true
      );
    };

    const apply = () => {
      let kb = 0;
      if (isInputFocused()) {
        kb = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      }
      if (Math.abs(kb - lastKb) < 8) return;
      lastKb = kb;
      document.documentElement.style.setProperty('--kb-height', `${kb}px`);
    };

    const schedule = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(apply);
      });
    };

    const onFocusChange = () => schedule();

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    schedule();

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
      document.documentElement.style.removeProperty('--kb-height');
    };
  }, []);

  useEffect(() => {
    if (!showMobileInput) return;
    const t = setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [showMobileInput]);

  useEffect(() => {
    const EDGE_ZONE = 40;
    const THRESHOLD = 50;
    const DIRECTION_LOCK = 8;

    const handleStart = (e) => {
      if (e.touches.length !== 1) return;

      const target = e.target;
      if (target && target.closest && target.closest('.chat-header-mascot-wrap')) {
        swipeDirectionRef.current = null;
        return;
      }

      if (target && target.closest && target.closest('.mobile-capsule')) {
        swipeDirectionRef.current = null;
        return;
      }

      if (target && target.closest && target.closest('.sticker-menu-overlay')) {
        swipeDirectionRef.current = null;
        return;
      }

      if (target && target.closest && (
        target.closest('.profile-panel') ||
        target.closest('.profile-overlay') ||
        target.closest('.storage-panel') ||
        target.closest('.storage-overlay') ||
        target.closest('.info-panel') ||
        target.closest('.info-overlay')
      )) {
        swipeDirectionRef.current = null;
        return;
      }

      const t = e.touches[0];

      if (showInfoRef.current) {
        swipeStartXRef.current = t.clientX;
        swipeStartYRef.current = t.clientY;
        swipeActiveRef.current = false;
        swipeDirectionRef.current = 'closeInfo';
        return;
      }

      if (showPlayersRef.current) {
        swipeStartXRef.current = t.clientX;
        swipeStartYRef.current = t.clientY;
        swipeActiveRef.current = false;
        swipeDirectionRef.current = 'close';
      } else if (t.clientX <= EDGE_ZONE) {
        swipeStartXRef.current = t.clientX;
        swipeStartYRef.current = t.clientY;
        swipeActiveRef.current = false;
        swipeDirectionRef.current = 'open';
      } else if (t.clientX >= window.innerWidth - EDGE_ZONE && !showDialogsRef.current) {
        swipeStartXRef.current = t.clientX;
        swipeStartYRef.current = t.clientY;
        swipeActiveRef.current = false;
        swipeDirectionRef.current = 'openDialogs';
      } else {
        swipeDirectionRef.current = null;
      }
    };

    const handleMove = (e) => {
      if (!swipeDirectionRef.current) return;
      if (swipeStartXRef.current == null) return;
      if (e.touches.length !== 1) return;

      const t = e.touches[0];
      const dx = t.clientX - swipeStartXRef.current;
      const dy = t.clientY - swipeStartYRef.current;

      if (!swipeActiveRef.current) {
        if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;

        if (Math.abs(dy) > Math.abs(dx)) {
          swipeDirectionRef.current = null;
          return;
        }
        if (swipeDirectionRef.current === 'open' && dx < 0) {
          swipeDirectionRef.current = null;
          return;
        }
        if (swipeDirectionRef.current === 'close' && dx > 0) {
          swipeDirectionRef.current = null;
          return;
        }
        if (swipeDirectionRef.current === 'closeInfo' && dx < 0) {
          swipeDirectionRef.current = null;
          return;
        }
        if (swipeDirectionRef.current === 'openDialogs' && dx > 0) {
          swipeDirectionRef.current = null;
          return;
        }
        swipeActiveRef.current = true;
      }

      if (e.cancelable) e.preventDefault();
    };

    const handleEnd = (e) => {
      if (swipeDirectionRef.current && swipeStartXRef.current != null) {
        const t = e.changedTouches[0];
        const dx = t.clientX - swipeStartXRef.current;

        if (swipeDirectionRef.current === 'open' && dx >= THRESHOLD) {
          chatTogglePlayers();
          setShowPlayers(true);
        } else if (swipeDirectionRef.current === 'close' && dx <= -THRESHOLD) {
          setShowPlayers(false);
        } else if (swipeDirectionRef.current === 'closeInfo' && dx >= THRESHOLD) {
          setShowInfo(false);
        } else if (swipeDirectionRef.current === 'openDialogs' && dx <= -THRESHOLD) {
          setShowPlayers(false);
          setShowInfo(false);
          setShowDialogs(true);
        }
      }
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;
      swipeActiveRef.current = false;
      swipeDirectionRef.current = null;
    };

    document.addEventListener('touchstart', handleStart, { passive: true });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);

    return () => {
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
    };
  }, [chatTogglePlayers, setShowPlayers, setShowInfo]);

  const togglePlayers = () => {
    setShowPlayers(prev => !prev);
  };

  const {
    capsuleOpen,
    handleCapsuleTap,
    handlePlayersCapsuleTap,
    handleWriteCapsuleTap,
    handleCapsuleTouchStart,
    handleCapsuleTouchMove,
    handleCapsuleTouchEnd,
  } = useCapsuleGestures({
    showMobileInput,
    setShowMobileInput,
    togglePlayers,
  });

  const handleOpenInfo = useCallback(() => {
    setShowPlayers(false);
    setShowInfo(true);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setShowInfo(false);
  }, []);

  const handleOpenDialogs = useCallback(() => {
    setShowPlayers(false);
    setShowInfo(false);
    setShowDialogs(true);
  }, []);

  const handleCloseDialogs = useCallback(() => {
    setShowDialogs(false);
  }, []);

  const handleOpenFromDialogs = useCallback((userId, nick) => {
    setCameFromDialogs(true);
    setShowDialogs(false);
    openPrivateChat(userId, nick);
  }, [openPrivateChat]);

  const handleClosePrivate = useCallback(() => {
    const wasFromDialogs = cameFromDialogs;
    closePrivateChat();
    setCameFromDialogs(false);
    if (wasFromDialogs) {
      setShowDialogs(true);
    }
  }, [cameFromDialogs, closePrivateChat]);

  const handleOpenProfile = useCallback((userId, nick) => {
    setShowPlayers(false);
    setProfileTarget({ userId, nickname: nick });
    sendMessage({ type: 'profile_get', data: { userId } });
  }, [sendMessage]);

  const handleCloseProfile = useCallback(() => {
    setProfileTarget(null);
  }, []);

  const handleProfileSave = useCallback((bio, avatarUrl, font, textColor, textRotation) => {
    sendMessage({
      type: 'profile_update',
      data: { bio, avatarUrl, font, textColor, textRotation },
    });
  }, [sendMessage]);

  const handleProfileRemoveFriend = useCallback((friendId) => {
    sendMessage({ type: 'friend_remove', data: { friendId } });
  }, [sendMessage]);

  const handleProfilePrivateChat = useCallback((userId, nick) => {
    setProfileTarget(null);
    openPrivateChat(userId, nick);
  }, [openPrivateChat]);

  const handleRequestDuel = useCallback((userId) => {
    if (!userId) return;
    const online = players.find(p => p.userId === userId);
    if (online) {
      duel.requestDuel(online.id);
    } else {
      setDuelNotice('Игрок офлайн');
      setTimeout(() => setDuelNotice(''), 3000);
    }
  }, [players, duel]);

  const handleProfileDuel = useCallback(() => {
    if (!profileTarget) return;
    handleRequestDuel(profileTarget.userId);
    setProfileTarget(null);
  }, [profileTarget, handleRequestDuel]);

  const handleStickerPick = useCallback((stickerUrl) => {
    sendSticker(stickerUrl);
    setStickerPanelOpen(false);
  }, [sendSticker]);

  const handleForwardOpen = useCallback((data) => {
    if (!data) return;
    setForwardData(data);
  }, []);

  const handleForwardPick = useCallback((target) => {
    if (!forwardData) return;
    const payload = {
      text: forwardData.text || '',
      imageUrl: forwardData.imageUrl || null,
      stickerUrl: forwardData.stickerUrl || null,
      voiceUrl: forwardData.voiceUrl || null,
      voiceDuration: forwardData.voiceDuration || null,
      voiceWaveform: forwardData.voiceWaveform || null,
      videoUrl: forwardData.videoUrl || null,
      videoDuration: forwardData.videoDuration || null,
      videoMime: forwardData.videoMime || null,
      forwardedFrom: forwardData.forwardedFrom,
    };
    if (target.type === 'general') {
      sendMessage({ type: 'message', data: payload });
    } else if (target.type === 'private' && target.userId) {
      sendMessage({ type: 'private_message', data: { ...payload, recipientId: target.userId } });
    }
    setForwardData(null);
  }, [forwardData, sendMessage]);

  const INPUT_DRAG_THRESHOLD = 40;

  const handleInputTouchStart = (e) => {
    const t = e.touches[0];
    inputTouchStartYRef.current = t.clientY;
    inputTouchStartXRef.current = t.clientX;
    inputDragYRef.current = 0;
  };

  const handleInputTouchMove = (e) => {
    if (inputTouchStartYRef.current == null) return;
    const t = e.touches[0];
    const dy = t.clientY - inputTouchStartYRef.current;
    const dx = t.clientX - inputTouchStartXRef.current;

    if (Math.abs(dx) > Math.abs(dy)) return;
    if (dy > 0) {
      inputDragYRef.current = dy;
      setInputDragY(dy);
    }
  };

  const handleInputTouchEnd = () => {
    if (inputDragYRef.current > INPUT_DRAG_THRESHOLD) setShowMobileInput(false);
    setInputDragY(0);
    inputDragYRef.current = 0;
    inputTouchStartYRef.current = null;
    inputTouchStartXRef.current = null;
  };

  // ===== MEDIA PERMISSIONS =====

  const ensureMediaPermissions = useCallback(async () => {
    if (permGrantedRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Камера и микрофон недоступны в этом браузере');
      setTimeout(() => setErrorMessage(''), 4000);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
      permGrantedRef.current = true;
      return true;
    } catch (err) {
      console.warn('[perm] denied:', err?.name);
      setErrorMessage('Разреши доступ к камере и микрофону в настройках');
      setTimeout(() => setErrorMessage(''), 5000);
      return false;
    }
  }, [setErrorMessage]);

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
        type: 'message',
        data: {
          text: '',
          voiceUrl: data.voiceUrl,
          voiceDuration: result.duration,
          voiceWaveform: result.waveform,
        },
      });
    } catch (err) {
      console.error('Ошибка загрузки голосового:', err);
      setErrorMessage('Не удалось отправить голосовое');
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setVoiceUploading(false);
    }
  }, [sendMessage, setErrorMessage]);

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
    console.log('[CLICK] voice button pressed');
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
        type: 'message',
        data: {
          text: '',
          videoUrl: data.videoUrl,
          videoDuration: result.duration,
          videoMime: result.mime,
        },
      });
    } catch (err) {
      console.error('Ошибка загрузки видео:', err);
      setErrorMessage('Не удалось отправить видео');
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setVideoUploading(false);
    }
  }, [sendMessage, setErrorMessage]);

  const handleCameraClick = useCallback(async () => {
    console.log('[CLICK] camera button pressed');
    if (isUploading || !isAuth) return;
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
  }, [isUploading, isAuth, videoRecActive, voiceRecActive, ensureMediaPermissions, videoRec, voiceRec]);

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

  // ===== /VOICE /VIDEO =====

  const handleNotifAllow = async () => {
    try {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          await subscribeToPush();
        }
      }
    } catch { /* noop */ }
    setShowNotifModal(false);
  };

  const handleNotifLater = () => {
    try {
      localStorage.setItem('ghost-chat-notif-snooze', String(Date.now()));
    } catch { /* noop */ }
    setShowNotifModal(false);
  };

  const handleReply = useCallback((m) => {
    setReplyTo({
      id: m.id,
      nickname: m.nickname,
      text: m.text || '',
      imageUrl: m.imageUrl || null,
    });
    setShowMobileInput(true);
  }, []);

  const handleMessageAdmin = () => {
    setShowInfo(false);
    if (!adminUserId) {
      setDuelNotice('Админ ещё не назначен');
      setTimeout(() => setDuelNotice(''), 3000);
      return;
    }
    const adminOnline = players.find(p => p.userId === adminUserId);
    const nick = adminOnline?.nickname || adminNickname || 'admin';
    openPrivateChat(adminUserId, nick);
  };

  const handleLogoutClick = useCallback(() => {
    setLogoutConfirm(true);
  }, []);

  const handleLogoutConfirm = () => {
    setLogoutConfirm(false);
    setShowPlayers(false);
    forceLogout('');
  };

  const handleBanConfirm = useCallback((userId, nickname) => {
    setBanConfirm({ userId, nickname });
  }, []);

    const handleBlockConfirm = useCallback((userId, nickname) => {
    setBlockConfirm({ userId, nickname });
  }, []);

  const handleBlockCancel = useCallback(() => {
    setBlockConfirm(null);
  }, []);

  const handleBlockDo = useCallback(() => {
    if (blockConfirm) {
      blockUser(blockConfirm.userId);
      setBlockConfirm(null);
    }
  }, [blockConfirm, blockUser]);

  const handleRitualAccept = useCallback(() => {
    if (friendshipRitual && friendshipRitual.requestId) {
      handleAcceptRequest(friendshipRitual.requestId);
    }
  }, [friendshipRitual, handleAcceptRequest]);

  const handleRitualDecline = useCallback(() => {
    if (friendshipRitual && friendshipRitual.requestId) {
      handleDeclineRequest(friendshipRitual.requestId);
    }
  }, [friendshipRitual, handleDeclineRequest]);

  const handleCloseDuelNotice = useCallback(() => {
    setDuelNotice('');
  }, []);

  const handleBanCancel = useCallback(() => {
    setBanConfirm(null);
  }, []);

  const handleBanDo = useCallback(() => {
    if (banConfirm) {
      banForever(banConfirm.userId);
      setBanConfirm(null);
    }
  }, [banConfirm, banForever]);

  const handleLogoutCancel = useCallback(() => {
    setLogoutConfirm(false);
  }, []);

  const handleDeferUpdate = useCallback(() => {
    setUpdateDeferred(true);
    setTimeout(() => setUpdateDeferred(false), UPDATE_DEFER_MS);
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => {
      try { window.location.reload(); } catch { /* noop */ }
    }, 360);
  }, [refreshing]);

  const voiceRecording = voiceRecActive;

  const isBusyForReload =
    !!fullscreenImage ||
    voiceRecActive ||
    videoRecActive ||
    sending ||
    isUploading ||
    !isAuth ||
    !!forwardData ||
    stickerPanelOpen ||
    showDialogs ||
    showInfo ||
    showPlayers ||
    !!banConfirm ||
    logoutConfirm ||
    showNotifModal ||
    !!profileTarget ||
    !!privateChat;

  const showUpdateToast =
    versionCheck.updateAvailable &&
    !updateDeferred &&
    !isBusyForReload;

  const hideHeaderMascot = mascotFlying || mascotPlace !== 'header';

  const myAvatarUrl = myId ? (avatarCache[myId] || null) : null;
  const inputActive = !!input.trim() || inputFocused;

  const isBusySending = isUploading || voiceUploading || videoUploading;
  const sendingLabel = voiceUploading
    ? 'Отправляем голосовое'
    : videoUploading
      ? 'Отправляем видео'
      : isUploading
        ? 'Отправляем фото'
        : 'Отправка';

  return (
    <>
      {isAuth && !showPlayers && !showDialogs && !showInfo && !profileTarget
        && !storageOpen && !privateChat && !stickerPanelOpen && !fullscreenImage && (
        <button
          className={`refresh-toggle${refreshing ? ' refresh-toggle--spinning' : ''}`}
          onClick={handleRefresh}
          aria-label="Обновить страницу"
          title="Обновить"
        >
          <RefreshIcon />
        </button>
      )}

      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Переключить тему"
      >
        <ThemeIcon />
      </button>

      {isAuth && (
        <button
          className="players-toggle"
          ref={playersBtnRef}
          onClick={togglePlayers}
        >
          👥
          {totalNotifications > 0 && <span className="unread-badge">!</span>}
        </button>
      )}

      {isAuth && (
        <button
          className="dialogs-toggle"
          onClick={handleOpenDialogs}
          title="Диалоги"
        >
          💬
          {Object.values(unreadByUser).filter(Boolean).length > 0 && (
            <span className="unread-badge">!</span>
          )}
        </button>
      )}

      {isAuth && (
        <PlayersPanel
          ref={playersOverlayRef}
          visible={showPlayers}
          orbitSlotRef={panelOrbitRef}
          orbitHidden={mascotFlying || mascotPlace !== 'panel'}
          players={players}
          dialogsBg={effectiveDialogsBg}
          unreadUserObjects={unreadUserObjects}
          onOpenDialogs={handleOpenDialogs}
          friends={friends}
          friendRequests={friendRequests}
          myId={myId}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          unreadByUser={unreadByUser}
          isAdmin={isAdmin}
          blockedIds={blockedIds}
          onWatchChat={watchChat}
          onBanConfirm={handleBanConfirm}
          onRequestDuel={handleRequestDuel}
          onOpenPrivateChat={openPrivateChat}
          onFriendRequest={handleFriendRequest}
          onBlockConfirm={handleBlockConfirm}
          onAcceptRequest={handleAcceptRequest}
          onDeclineRequest={handleDeclineRequest}
          onOpenInfo={handleOpenInfo}
          onLogout={handleLogoutClick}
          onOpenProfile={handleOpenProfile}
        />
      )}

      {showDialogs && isAuth && (
        <DialogsPanel
          dialogs={dialogs}
          players={players}
          myId={myId}
          dialogsBg={dialogsBg}
          globalDialogsBg={globalDialogsBg}
          onSaveDialogsBg={saveDialogsBg}
          onSetGlobalBg={setGlobalDialogsBgAdmin}
          isAdmin={isAdmin}
          token={token}
          onOpen={handleOpenFromDialogs}
          onClose={handleCloseDialogs}
          onOpenProfile={handleOpenProfile}
        />
      )}

      {showInfo && (
        <InfoPanel
          ref={infoPanelRef}
          onClose={handleCloseInfo}
          onMessageAdmin={handleMessageAdmin}
          blockedUsers={blockedUsers}
          onUnblockUser={unblockUser}
          version={VERSION}
        />
      )}

      {profileTarget && (
        <ProfilePanel
          data={profileData?.userId === profileTarget.userId ? profileData : null}
          onClose={handleCloseProfile}
          onSave={handleProfileSave}
          onRemoveFriend={handleProfileRemoveFriend}
          onOpenPrivateChat={handleProfilePrivateChat}
          onRequestDuel={handleProfileDuel}
          onOpenStorage={() => { setProfileTarget(null); setStorageOpen(true); }}
          token={token}
          apiUrl={API_URL}
        />
      )}

      {privateChat && (
        <PrivateChat
          key={privateChat.userId}
          userId={privateChat.userId}
          nickname={privateChat.nickname}
          myId={myId}
          myNickname={nickname}
          sendMessage={sendMessage}
          initialMessages={privateChat.messages || []}
          historyLoaded={privateChat.historyLoaded}
          dialogsBg={effectiveDialogsBg}
          typingUser={privateTypingUser}
          onClose={handleClosePrivate}
          stickers={stickers}
          isAdmin={isAdmin}
          token={token}
          onStickersUpdated={setStickersList}
          onForward={handleForwardOpen}
          avatarUrl={avatarCache[privateChat.userId] || null}
          favoriteStickers={favoriteStickers}
          onToggleFavorite={toggleFavoriteSticker}
          myAvatarUrl={myAvatarUrl}
          storageSourceIds={storageSourceIds}
          onSaveToStorage={storage.saveToStorage}
        />
      )}

      {friendshipRitual && (
        <FriendshipRitual
          open={!!friendshipRitual}
          myId={myId}
          initiatorId={friendshipRitual.initiatorId}
          initiatorNick={friendshipRitual.initiatorNick}
          initiatorAvatar={
            friendshipRitual.initiatorAvatar ||
            avatarCache[friendshipRitual.initiatorId] ||
            null
          }
          targetId={friendshipRitual.targetId}
          targetNick={friendshipRitual.targetNick}
          targetAvatar={
            friendshipRitual.targetAvatar ||
            avatarCache[friendshipRitual.targetId] ||
            null
          }
          phase={friendshipRitual.phase}
          rejectCount={friendshipRitual.rejectCount || 0}
          onAccept={handleRitualAccept}
          onDecline={handleRitualDecline}
          onCancel={clearRitual}
          onDone={clearRitual}
        />
      )}

      <ConfirmModal
        open={!!banConfirm}
        title={`Забанить ${banConfirm?.nickname || 'пользователя'} навсегда?`}
        description="Пользователь больше не сможет войти в чат."
        confirmText="Да, забанить"
        danger
        onConfirm={handleBanDo}
        onCancel={handleBanCancel}
      />

      <ConfirmModal
        open={!!blockConfirm}
        title={`Заблокировать ${blockConfirm?.nickname || 'пользователя'}?`}
        description="Он исчезнет из онлайна и из твоих диалогов. Разблокировать можно в разделе «Заблокированные» панели «О приложении»."
        confirmText="Да, заблокировать"
        danger
        zIndex={2100}
        onConfirm={handleBlockDo}
        onCancel={handleBlockCancel}
      />

      <ConfirmModal
        open={logoutConfirm}
        title="Выйти из аккаунта?"
        description="Вы выйдете из banjoboy's crew. Зайти снова можно в любой момент."
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
      />

      <NotificationPermissionModal
        open={showNotifModal}
        onAllow={handleNotifAllow}
        onLater={handleNotifLater}
      />

      <div className="chat-container">
        <div className={`chat-main ${showMobileInput ? 'mobile-input-open' : ''}`}>
          <div className="chat-header">
            <div className="chat-header-mascot-wrap">
              <img
                ref={headerMascotRef}
                src="/mascot.png"
                alt="banjoboy"
                className={
                  `chat-header-logo` +
                  (yt.isPlaying || voiceRecording ? ' mascot-playing' : '') +
                  (hideHeaderMascot ? ' mascot-hidden' : '')
                }
                draggable={false}
                onPointerDown={handleMascotPointerDown}
                onPointerMove={handleMascotPointerMove}
                onPointerUp={handleMascotPointerUp}
                onPointerCancel={handleMascotPointerUp}
                onContextMenu={handleMascotContextMenu}
              />
              {volumeTipVisible && (
                <div className="mascot-volume-tip">🔊 {yt.volume}</div>
              )}
              {yt.isPlaying && (
                <div className="mascot-equalizer">
                  <span /><span /><span /><span />
                </div>
              )}
            </div>

            <div className="chat-header-text">
              {trackTitleVisible && yt.trackTitle ? (
                <div className="chat-header-track-title" title={yt.trackTitle}>
                  ♫ {yt.trackTitle}
                </div>
              ) : (
                <div className="chat-header-title">banjoboy's crew</div>
              )}
              <div className="chat-header-subtitle">
                {isConnected ? 'онлайн' : 'оффлайн'}
              </div>
              <div className="chat-header-version">v{VERSION}</div>
            </div>
            <button
              className="chat-header-theme"
              onClick={toggleTheme}
              title="Переключить тему"
              aria-label="Переключить тему"
            >
              <ThemeIcon />
            </button>
          </div>

          <RoomPulse
            playersCount={players.length}
            typingCount={typingUsers.length}
            isConnected={isConnected}
          />

          <div className="qr-wrap">
            <QRCodeSVG value={window.location.href} size={100} />
            <span className="qr-label">QR для входа</span>
          </div>

          <div className="messages-wrapper">
            <MessageList
              messages={messages}
              isAdmin={isAdmin}
              deleteMessage={deleteMessage}
              toggleReactions={toggleReactions}
              activeMessageId={activeMessageId}
              setActiveMessageId={setActiveMessageId}
              nickname={nickname}
              sendReaction={sendReaction}
              setFullscreenImage={setFullscreenImage}
              messagesEndRef={messagesEndRef}
              myId={myId}
              onEditMessage={handleEditMessage}
              containerRef={messagesContainerRef}
              onReply={handleReply}
              onForward={handleForwardOpen}
              avatarByUser={avatarCache}
              bannedUsers={bannedUsers}
              favoriteStickers={favoriteStickers}
              onToggleFavorite={toggleFavoriteSticker}
              storageSourceIds={storageSourceIds}
              onSaveToStorage={storage.saveToStorage}
            />

            {notices.length > 0 && (
              <div className="join-notices">
                {notices.map(n => (
                  <div key={n.id} className="join-notice">
                    <div
                      className="join-notice-avatar"
                      style={{ background: getAvatarColor(n.nickname) }}
                    >
                      {getInitial(n.nickname)}
                    </div>
                    <span className="join-notice-text">
                      {n.nickname} {n.type === 'join' ? 'зашёл' : 'вышел'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {showScrollDown && (
              <button className="scroll-down-btn" onClick={scrollToBottom} title="Вниз">
                ↓
              </button>
            )}
          </div>

          <div className="typing-indicator">
            {typingUsers.length > 0 && `${typingUsers.join(', ')} печатает...`}
          </div>

          {replyTo && (
            <div className="reply-preview">
              <div className="reply-preview-body">
                <div className="reply-preview-nick">{replyTo.nickname}</div>
                <div className="reply-preview-text">
                  {replyTo.text || (replyTo.imageUrl ? '📷 фото' : '')}
                </div>
              </div>
              <button
                className="reply-preview-close"
                onClick={() => setReplyTo(null)}
                aria-label="Отменить ответ"
              >
                ×
              </button>
            </div>
          )}

          {isBusySending ? (
            <SendingIndicator label={sendingLabel} />
          ) : (
            <div
              className="input-row"
              onTouchStart={handleInputTouchStart}
              onTouchMove={handleInputTouchMove}
              onTouchEnd={handleInputTouchEnd}
              style={{
                transform: `translateY(${inputDragY}px)`,
                transition: inputDragY === 0 ? 'transform 0.2s ease-out' : 'none',
              }}
            >
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setStickerPanelOpen(v => !v)}
                disabled={!isAuth}
                title="Стикеры"
                aria-label="Стикеры"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l7-7V6a3 3 0 0 0-3-3z" />
                  <path d="M13 21v-5a3 3 0 0 1 3-3h5" />
                </svg>
              </button>
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isAuth || isUploading}
                title="Прикрепить фото"
                aria-label="Прикрепить фото"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <ChatInput
                ref={inputRef}
                value={input}
                onChange={(text) => handleInputChange({ target: { value: text } })}
                onSend={handleSendMessage}
                disabled={!isAuth || isUploading}
                placeholder={isUploading ? 'Загрузка фото...' : 'Сообщение'}
                maxLength={2000}
                onFocusChange={setInputFocused}
              />
              <InputActionButtons
                active={inputActive}
                disabled={!isAuth || isUploading}
                sending={sending}
                rotating={true}
                onSend={handleSendMessage}
                onVoiceClick={handleVoiceClick}
                onCameraClick={handleCameraClick}
              />
            </div>
          )}

          <div
            className={`mobile-capsule${capsuleOpen ? ' mobile-capsule--open' : ''}${!capsuleOpen && totalNotifications > 0 ? ' mobile-capsule--has-pulse' : ''}`}
            onClick={handleCapsuleTap}
            onTouchStart={handleCapsuleTouchStart}
            onTouchMove={handleCapsuleTouchMove}
            onTouchEnd={handleCapsuleTouchEnd}
            onTouchCancel={handleCapsuleTouchEnd}
          >
            {!capsuleOpen && totalNotifications > 0 && (
              <span className="capsule-pulse" />
            )}

            <div className="capsule-content">
              <button
                type="button"
                className="capsule-btn capsule-btn--players"
                ref={mobilePlayersBtnRef}
                onClick={handlePlayersCapsuleTap}
                aria-label="Игроки"
              >
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {totalNotifications > 0 && (
                  <span className="capsule-badge">!</span>
                )}
              </button>

              <button
                type="button"
                className="capsule-btn capsule-btn--write"
                onClick={handleWriteCapsuleTap}
                aria-label="Написать"
              >
                <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="status">
            {bannedUntil && ` — бан до ${new Date(bannedUntil).toLocaleTimeString()}`}
            {errorMessage && <div style={{ color: 'var(--danger)', marginTop: 4 }}>{errorMessage}</div>}
            {isUploading && <div style={{ color: 'var(--btn-bg)', marginTop: 4 }}>Загрузка фото...</div>}
          </div>

          <DuelBox
            duelInvite={duel.duelInvite}
            duelState={duel.duelState}
            duelNotice={duelNotice}
            onAcceptDuel={duel.acceptDuel}
            onDeclineDuel={duel.clearInvite}
            onChoose={duel.choose}
            onCloseDuelNotice={handleCloseDuelNotice}
          />
        </div>
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

      {!isAuth && (
        <AuthModal
          isRegisterMode={isRegisterMode}
          setIsRegisterMode={setIsRegisterMode}
          authNickname={authNickname}
          setAuthNickname={setAuthNickname}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          authError={authError}
          showIdleNotice={showIdleNotice}
          handleAuthSubmit={handleAuthSubmit}
        />
      )}

      <StorageToast trigger={storage.lastSavedAt} />
      <PrivateMessageToasts
        users={unreadUserObjects}
        visible={mascotPlace === 'center' && !mascotFlying}
        instantHide={showDialogs || privateChat || !!profileTarget || storageOpen}
        onOpenDialogs={handleOpenDialogs}
        mascotRef={centerMascotRef}
      />
      <StoragePanel
        open={storageOpen}
        onClose={() => setStorageOpen(false)}
        items={storage.items}
        isLoaded={storage.isLoaded}
        error={storage.error}
        onDelete={storage.deleteFromStorage}
        onReorder={storage.reorder}
      />

      <StickerPanel
        open={stickerPanelOpen}
        onClose={() => setStickerPanelOpen(false)}
        stickers={stickers}
        onPick={handleStickerPick}
        isAdmin={isAdmin}
        token={token}
        onUploaded={setStickersList}
        favoriteStickers={favoriteStickers}
        onToggleFavorite={toggleFavoriteSticker}
      />

      <ForwardPickerModal
        open={!!forwardData}
        onClose={() => setForwardData(null)}
        onPick={handleForwardPick}
        friends={friends}
      />

      <InstallPwaBanner />
      <InstallPwaBannerAndroid />

      <UpdateToast
        open={showUpdateToast}
        onReload={versionCheck.reload}
        onDefer={handleDeferUpdate}
      />

      {fullscreenImage && (
        <div
          className="fullscreen-overlay"
          ref={fsOverlayRef}
          onClick={closeFullscreen}
        >
          <div className="fs-topbar" onClick={(e) => e.stopPropagation()}>
            <div className="fs-author">
              <div
                className="fs-author-avatar"
                style={
                  fsAuthorAvatarUrl
                    ? { backgroundImage: `url(${fsAuthorAvatarUrl})` }
                    : { background: getAvatarColor(fullscreenMessage?.nickname || '?') }
                }
              >
                {!fsAuthorAvatarUrl && getInitial(fullscreenMessage?.nickname || '?')}
              </div>
              <div className="fs-author-meta">
                <div className="fs-author-nick">
                  {fullscreenMessage?.nickname || '—'}
                </div>
                <div className="fs-author-date">
                  {fullscreenMessage ? formatMessageDate(fullscreenMessage.time) : ''}
                </div>
              </div>
            </div>

            {currentImageIndex >= 0 && imageMessages.length > 0 && (
              <div className="fs-counter">
                {currentImageIndex + 1} / {imageMessages.length}
              </div>
            )}

            <button
              className="fs-close"
              onClick={closeFullscreen}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          <div className="fs-stage" onClick={closeFullscreen}>
            <button
              type="button"
              className="fs-nav fs-nav--prev"
              onClick={fsGoPrev}
              disabled={!hasPrevImage}
              aria-label="Предыдущее фото"
            >
              ‹
            </button>

            <img
              key={fullscreenImage.messageId}
              ref={fsImgRef}
              src={fullscreenImage.url}
              alt=""
              className="fs-image"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleFsTouchStart}
              onTouchMove={handleFsTouchMove}
              onTouchEnd={handleFsTouchEnd}
              onTouchCancel={handleFsTouchEnd}
              onDoubleClick={handleFsDoubleTap}
            />

            <button
              type="button"
              className="fs-nav fs-nav--next"
              onClick={fsGoNext}
              disabled={!hasNextImage}
              aria-label="Следующее фото"
            >
              ›
            </button>

            {fsHeart && (
              <span
                key={fsHeart.key}
                className="fs-heart-burst"
                style={{ left: fsHeart.x, top: fsHeart.y }}
              >
                ❤️
              </span>
            )}

            {imageMessages.length > 1 && imageMessages.length <= 12 && (
              <div className="fs-dots" aria-hidden="true">
                {imageMessages.map((im, idx) => (
                  <span
                    key={im.id}
                    className={`fs-dot ${idx === currentImageIndex ? 'fs-dot--active' : ''}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="fs-bottombar" onClick={(e) => e.stopPropagation()}>
            {fullscreenReactionEntries.length > 0 && (
              <div className="fs-reactions-strip">
                {fullscreenReactionEntries.map(([emoji, users]) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`fs-reaction-badge ${users.includes(nickname) ? 'own' : ''}`}
                    onClick={() =>
                      setFsReactionListEmoji(prev => (prev === emoji ? null : emoji))
                    }
                  >
                    <span className="fs-reaction-badge-emoji">{emoji}</span>
                    <span className="fs-reaction-badge-count">{users.length}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`fs-reaction-toggle ${showFullscreenReactions ? 'active' : ''}`}
              onClick={handleFullscreenReactionToggle}
              aria-label="Реакции"
            >
              😀
            </button>
          </div>

          {showFullscreenReactions && fsReactionAnchor && fullscreenMessage && (
            <ReactionWheel
              open
              anchorX={fsReactionAnchor.x}
              anchorY={fsReactionAnchor.y}
              reactions={fullscreenMessage.reactions || {}}
              nickname={nickname}
              onPick={handleFullscreenReactionPick}
              onClose={handleFullscreenReactionClose}
              ignoreSelector=".fs-reaction-toggle"
            />
          )}

          {fsReactionListEmoji &&
            fullscreenMessage?.reactions?.[fsReactionListEmoji] && (
              <div
                className="fs-reaction-list"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="fs-reaction-list-header">
                  <span className="fs-reaction-list-emoji">{fsReactionListEmoji}</span>
                  <span className="fs-reaction-list-count">
                    {fullscreenMessage.reactions[fsReactionListEmoji].length}
                  </span>
                </div>
                <div className="fs-reaction-list-users">
                  {fullscreenMessage.reactions[fsReactionListEmoji].map((user, i) => (
                    <span key={i} className="fs-reaction-user">
                      {user}
                    </span>
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
        </div>
      )}

      <div className={`yt-hidden-host ${showMiniPlayer ? 'yt-hidden-host--visible' : ''}`}>
        <div id={yt.containerId} />
      </div>
    </>
  );
};

export default Chat;