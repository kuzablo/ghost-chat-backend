import { useState, useRef, useEffect, useCallback } from 'react';

/*
  [2.41.0] favoriteStickers — избранные стикеры пользователя.
           toggleFavoriteSticker(url) → WS toggle_favorite_sticker.
           favorite_stickers_updated обновляет стейт.
  [2.37.1] Убран мёртвый case 'friend_request_accepted'.
  [2.36.3] globalDialogsBg + setGlobalDialogsBgAdmin
*/

const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
// [2.50.0] Видео-файлы — 100 МБ как на бэке.
const MAX_VIDEO_MB = 100;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

export const useChat = ({
  sendMessage,
  isAuth,
  isAdmin,
  myId,
  audio,
  nicknameRef,
  onNotice,
}) => {
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [notices, setNotices] = useState([]);
  const [bannedUntil, setBannedUntil] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hiddenUnread, setHiddenUnread] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [bannedUsers, setBannedUsers] = useState(() => new Set());
  const [avatarCache, setAvatarCache] = useState({});
  const [friendshipRitual, setFriendshipRitual] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [dialogsBg, setDialogsBg] = useState(null);
  const [globalDialogsBg, setGlobalDialogsBg] = useState(null);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [isAvatarsLoaded, setIsAvatarsLoaded] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [favoriteStickers, setFavoriteStickers] = useState([]);

  const sendMessageRef = useRef(sendMessage);
  const isAuthRef = useRef(isAuth);
  const isAdminRef = useRef(isAdmin);
  const myIdRef = useRef(myId);
  const audioRef = useRef(audio);
  const onNoticeRef = useRef(onNotice);
  const replyToRef = useRef(replyTo);

  const typingTimeoutRef = useRef(null);
  const prevPlayerNicksRef = useRef(new Set());
  const firstPlayersLoadRef = useRef(true);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { isAuthRef.current = isAuth; }, [isAuth]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { audioRef.current = audio; }, [audio]);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);
  useEffect(() => { replyToRef.current = replyTo; }, [replyTo]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) setHiddenUnread(0);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const currentNicks = new Set(players.map(p => p.nickname));

    if (firstPlayersLoadRef.current) {
      prevPlayerNicksRef.current = currentNicks;
      firstPlayersLoadRef.current = false;
      return;
    }

    const prev = prevPlayerNicksRef.current;
    const joined = [...currentNicks].filter(n => !prev.has(n));
    const left = [...prev].filter(n => !currentNicks.has(n));

    prevPlayerNicksRef.current = currentNicks;

    const myNick = nicknameRef.current;
    const filteredJoined = joined.filter(n => n !== myNick);
    const filteredLeft = left.filter(n => n !== myNick);

    if (filteredJoined.length === 0 && filteredLeft.length === 0) return;

    const stamp = Date.now();
    const added = [];
    filteredJoined.forEach((nick, i) => {
      added.push({ id: `j-${stamp}-${i}`, nickname: nick, type: 'join' });
    });
    filteredLeft.forEach((nick, i) => {
      added.push({ id: `l-${stamp}-${i}`, nickname: nick, type: 'leave' });
    });

    setNotices(p => [...p, ...added].slice(-3));

    added.forEach(n => {
      setTimeout(() => {
        setNotices(p => p.filter(x => x.id !== n.id));
      }, 4000);
    });
  }, [players, nicknameRef]);

  const samePlayerList = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (
        x.id !== y.id ||
        x.userId !== y.userId ||
        x.nickname !== y.nickname ||
        x.role !== y.role ||
        x.wins !== y.wins ||
        x.losses !== y.losses ||
        (x.avatarUrl || null) !== (y.avatarUrl || null)
      ) return false;
    }
    return true;
  };

  const sameFriendList = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (
        x.userId !== y.userId ||
        x.nickname !== y.nickname ||
        (x.avatarUrl || null) !== (y.avatarUrl || null)
      ) return false;
    }
    return true;
  };

  const mergeAvatars = useCallback((items) => {
    setAvatarCache(prev => {
      let changed = false;
      const next = { ...prev };
      for (const it of items || []) {
        const id = it.userId || it.id;
        const url = it.avatarUrl;
        if (id && url && next[id] !== url) {
          next[id] = url;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleSendMessage = useCallback(() => {
    if (sending || !sendMessageRef.current || !isAuthRef.current) return;
    const text = input.trim();
    if (!text) return;
    setSending(true);
    sendMessageRef.current({
      type: 'message',
      data: { text, replyTo: replyToRef.current || null },
    });
    if (audioRef.current) audioRef.current.playSend();
    setInput('');
    setReplyTo(null);
    sendMessageRef.current({ type: 'typing', data: { isTyping: false } });
    setTimeout(() => setSending(false), 800);
    try { localStorage.removeItem('ghost-chat-draft'); } catch { /* noop */ }
  }, [input, sending]);

  const handleEditMessage = useCallback((messageId, newText) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'edit_message', data: { messageId, text: newText } });
    }
  }, []);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!isAuthRef.current || !sendMessageRef.current) {
      setErrorMessage('Не авторизован или нет соединения');
      return;
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      setErrorMessage('Только фото или видео');
      e.target.value = '';
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    const limitMb = isVideo ? MAX_VIDEO_MB : MAX_UPLOAD_MB;
    const limitBytes = isVideo ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;

    if (file.size > limitBytes) {
      setErrorMessage(`Файл больше ${limitMb} МБ`);
      e.target.value = '';
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const endpoint = isVideo
        ? 'https://api.banjoboy420.ru/api/upload-video'
        : 'https://api.banjoboy420.ru/api/upload';

      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (isVideo) {
        sendMessageRef.current({
          type: 'message',
          data: {
            text: '',
            videoUrl: data.videoUrl,
            videoDuration: 0,
            videoMime: file.type,
            isCircle: false,
            replyTo: replyToRef.current || null,
          },
        });
      } else {
        sendMessageRef.current({
          type: 'message',
          data: { text: '', imageUrl: data.imageUrl, replyTo: replyToRef.current || null },
        });
      }

      if (audioRef.current) audioRef.current.playSend();
      setReplyTo(null);
      e.target.value = '';
    } catch (err) {
      console.error('Ошибка загрузки файла:', err);
      setErrorMessage('Не удалось загрузить: ' + (err?.message || ''));
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    if (sendMessageRef.current && isAuthRef.current) {
      if (e.target.value.trim()) {
        sendMessageRef.current({ type: 'typing', data: { isTyping: true } });
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          if (sendMessageRef.current) {
            sendMessageRef.current({ type: 'typing', data: { isTyping: false } });
          }
        }, 1500);
      } else {
        sendMessageRef.current({ type: 'typing', data: { isTyping: false } });
      }
    }
  }, []);

  const sendReaction = useCallback((messageId, emoji) => {
    if (sendMessageRef.current && isAuthRef.current) {
      sendMessageRef.current({ type: 'reaction', data: { messageId, emoji } });
    }
  }, []);

  const deleteMessage = useCallback((messageId) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'delete_message', data: { messageId } });
    }
  }, []);

  const banForever = useCallback((userId) => {
    if (sendMessageRef.current && isAdminRef.current) {
      sendMessageRef.current({ type: 'ban_forever', data: { userId } });
    }
  }, []);

  const watchChat = useCallback((userId) => {
    if (sendMessageRef.current && isAdminRef.current) {
      sendMessageRef.current({ type: 'watch_chat', data: { userId } });
    }
  }, []);

  const handleFriendRequest = useCallback((receiverId) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'friend_request', data: { receiverId } });
    }
  }, []);

  const handleAcceptRequest = useCallback((requestId) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'friend_request_accept', data: { requestId } });
    }
    setFriendRequests(prev => prev.filter(r => r.requestId !== requestId));
    setFriendshipRitual(prev => {
      if (!prev || prev.requestId !== requestId) return prev;
      return { ...prev, phase: 'accept' };
    });
  }, []);

  const handleDeclineRequest = useCallback((requestId) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'friend_request_decline', data: { requestId } });
    }
    setFriendRequests(prev => prev.filter(r => r.requestId !== requestId));
    setFriendshipRitual(prev => {
      if (!prev || prev.requestId !== requestId) return prev;
      return { ...prev, phase: 'reject' };
    });
  }, []);

  const togglePlayers = useCallback(() => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'get_friends' });
    }
  }, []);

  const clearRitual = useCallback(() => {
    setFriendshipRitual(null);
  }, []);

  const blockUser = useCallback((userId) => {
    if (sendMessageRef.current && userId) {
      sendMessageRef.current({ type: 'block_user', data: { userId } });
    }
  }, []);

  const unblockUser = useCallback((userId) => {
    if (sendMessageRef.current && userId) {
      sendMessageRef.current({ type: 'unblock_user', data: { userId } });
    }
  }, []);

  const saveDialogsBg = useCallback((bg) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'dialogs_bg_update', data: { bg } });
    }
  }, []);

  const setGlobalDialogsBgAdmin = useCallback((bg) => {
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'admin_set_global_bg', data: { bg } });
    }
  }, []);

  const sendSticker = useCallback((stickerUrl) => {
    if (!stickerUrl) return;
    if (!sendMessageRef.current || !isAuthRef.current) return;
    sendMessageRef.current({
      type: 'message',
      data: { text: '', stickerUrl },
    });
    if (audioRef.current) audioRef.current.playSend();
  }, []);

  const setStickersList = useCallback((list) => {
    setStickers(Array.isArray(list) ? list : []);
  }, []);

  // [2.41.0] Переключить избранный стикер.
  const toggleFavoriteSticker = useCallback((stickerUrl) => {
    if (!stickerUrl || !sendMessageRef.current || !isAuthRef.current) return;
    sendMessageRef.current({ type: 'toggle_favorite_sticker', data: { stickerUrl } });
  }, []);

  const handleWs = useCallback((msg) => {
    switch (msg.type) {
      case 'auth_ok':
        setDialogsBg(msg.data?.dialogsBg || null);
        setGlobalDialogsBg(msg.data?.globalDialogsBg || null);
        setFavoriteStickers(
          Array.isArray(msg.data?.favoriteStickers) ? msg.data.favoriteStickers : []
        );
        return false;

      case 'friends_list':
        setFriends(prev => sameFriendList(prev, msg.data) ? prev : msg.data);
        mergeAvatars(msg.data);
        return true;

      case 'history':
        setMessages(msg.data);
        setIsHistoryLoaded(true);
        return true;

      case 'message':
        setMessages(prev => [...prev, msg.data]);
        if (audioRef.current) audioRef.current.playNotification();
        if (document.hidden && msg.data.nickname !== nicknameRef.current) {
          setHiddenUnread(n => n + 1);
        }
        return true;

      case 'message_update':
        if (msg.data.id) {
          setMessages(prev => prev.map(m => m.id === msg.data.id ? msg.data : m));
        }
        return true;

      case 'message_deleted':
        setMessages(prev => prev.filter(m => m.id !== msg.data.messageId));
        return true;

      case 'players':
        setPlayers(prev => samePlayerList(prev, msg.data) ? prev : msg.data);
        mergeAvatars(msg.data);
        return true;

      case 'typing': {
        const { nickname: typingNick, isTyping } = msg.data;
        setTypingUsers(prev => {
          if (isTyping && !prev.includes(typingNick)) return [...prev, typingNick];
          if (!isTyping) return prev.filter(n => n !== typingNick);
          return prev;
        });
        return true;
      }

      case 'banned':
        setBannedUntil(msg.data.until);
        return true;

      case 'banned_users_update': {
        const ids = msg.data?.bannedUserIds || [];
        setBannedUsers(new Set(ids));
        return true;
      }

      case 'avatars_map':
        mergeAvatars(msg.data?.avatars || []);
        setIsAvatarsLoaded(true);
        return true;

      case 'stickers_list': {
        const list = msg.data?.stickers || [];
        setStickers(list);
        return true;
      }

      case 'favorite_stickers_updated': {
        const list = msg.data?.favoriteStickers;
        if (Array.isArray(list)) setFavoriteStickers(list);
        return true;
      }

      case 'blocks_list':
        setBlockedUsers(msg.data?.blocked || []);
        return true;

      case 'dialogs_bg_updated':
        setDialogsBg(msg.data?.bg || null);
        return true;

      case 'global_bg_updated':
        setGlobalDialogsBg(msg.data?.bg || null);
        return true;

      case 'dialogs_bg_error':
        if (onNoticeRef.current) onNoticeRef.current(msg.data?.message || 'Ошибка фона');
        return true;

      case 'admin_error':
        if (onNoticeRef.current) onNoticeRef.current(msg.data.message);
        return true;

      case 'friend_request_sent': {
        setFriendshipRitual({
          requestId: msg.data.requestId,
          initiatorId: myIdRef.current,
          initiatorNick: nicknameRef.current,
          initiatorAvatar: null,
          targetId: msg.data.receiverId,
          targetNick: msg.data.receiverNickname,
          targetAvatar: msg.data.receiverAvatar || null,
          rejectCount: msg.data.rejectCount || 0,
          phase: 'pull',
        });
        return true;
      }

      case 'new_friend_request': {
        setFriendRequests(prev => [...prev, msg.data]);
        setFriendshipRitual({
          requestId: msg.data.requestId,
          initiatorId: msg.data.senderId,
          initiatorNick: msg.data.senderNickname,
          initiatorAvatar: msg.data.senderAvatar || null,
          targetId: myIdRef.current,
          targetNick: nicknameRef.current,
          targetAvatar: null,
          rejectCount: 0,
          phase: 'appear',
        });
        return true;
      }

      case 'friend_request_accepted_notification':
        if (onNoticeRef.current) {
          onNoticeRef.current(`🎉 ${msg.data.user1Nickname} и ${msg.data.user2Nickname} теперь друзья!`);
        }
        if (sendMessageRef.current) {
          sendMessageRef.current({ type: 'get_friends' });
        }
        setFriendshipRitual(prev => {
          if (!prev) return prev;
          return { ...prev, phase: 'accept' };
        });
        return true;

      case 'friend_request_declined': {
        const nick = msg.data?.nickname || 'Пользователь';
        if (onNoticeRef.current) {
          onNoticeRef.current(`${nick} отклонил(а) запрос на дружбу`);
        }
        setFriendRequests(prev => prev.filter(r => r.senderId !== msg.data.userId));
        setFriendshipRitual(prev => {
          if (!prev) return prev;
          return { ...prev, phase: 'reject' };
        });
        return true;
      }

      case 'friend_requests_list':
        setFriendRequests(msg.data);
        return true;

      case 'profile_data':
        setProfileData(msg.data);
        mergeAvatars([msg.data]);
        return true;

      case 'profile_changed': {
        const { userId, avatarUrl, bio, font, textColor, textRotation } = msg.data;
        setFriends(prev => prev.map(f => f.userId === userId ? { ...f, avatarUrl } : f));
        setPlayers(prev => prev.map(p => p.userId === userId ? { ...p, avatarUrl } : p));
        setProfileData(prev => (
          prev && prev.userId === userId
            ? { ...prev, avatarUrl, bio, font, textColor, textRotation }
            : prev
        ));
        if (userId && avatarUrl) {
          setAvatarCache(prev => (prev[userId] === avatarUrl ? prev : { ...prev, [userId]: avatarUrl }));
        }
        return true;
      }

      case 'profile_error':
        if (onNoticeRef.current) onNoticeRef.current(msg.data.message || 'Ошибка профиля');
        return true;

      case 'friend_removed': {
        const { userId } = msg.data;
        setFriends(prev => prev.filter(f => f.userId !== userId));
        setProfileData(prev => (
          prev && prev.userId === userId ? { ...prev, isFriend: false } : prev
        ));
        return true;
      }

      default:
        return false;
    }
  }, [nicknameRef, mergeAvatars]);

  return {
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
    setProfileData,
    isHistoryLoaded,
    isAvatarsLoaded,
    handleWs,
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
    togglePlayers,
    clearRitual,
    blockUser,
    unblockUser,
    saveDialogsBg,
    setGlobalDialogsBgAdmin,
    sendSticker,
    setStickersList,
    toggleFavoriteSticker,
  };
};