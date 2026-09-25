import { useState, useRef, useEffect, useCallback } from 'react';

/*
  [2.42.0] previewFromMessage учитывает videoUrl.
  [2.37.1] Убран мёртвый case 'unread_private_list'.
  [2.35.60] private_message_deleted — удаление + пересчёт preview.
  [2.35.49] lastFromMe/lastIsRead + dialog_read_update.
  [2.35.41] historyLoaded в privateChat.
  [2.28.7] восстанавливаем unreadByUser из dialogs_list.
*/

const previewFromMessage = (m) => {
  if (!m) return '· · ·';
  if (m.text && m.text.trim()) return m.text;
  if (m.stickerUrl) return '🎨 стикер';
  if (m.imageUrl) return '📷 фото';
  if (m.voiceUrl) return '🎤 голосовое';
  if (m.videoUrl) return '📹 видео';
  return '· · ·';
};

export const usePrivateChat = ({ sendMessage, myId, players }) => {
  const [privateChat, setPrivateChat] = useState(null);
  const [privateTypingUser, setPrivateTypingUser] = useState(null);
  const [unreadByUser, setUnreadByUser] = useState({});
  const [dialogs, setDialogs] = useState([]);

  const sendMessageRef = useRef(sendMessage);
  const myIdRef = useRef(myId);
  const playersRef = useRef(players);
  const privateChatRef = useRef(privateChat);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { privateChatRef.current = privateChat; }, [privateChat]);

  const openPrivateChat = useCallback((userId, nickname) => {
    if (userId === myIdRef.current) return;
    setPrivateChat({ userId, nickname, messages: [], historyLoaded: false });
    setUnreadByUser(prev => {
      const { [userId]: _, ...rest } = prev;
      return rest;
    });
    setDialogs(prev => prev.map(d =>
      d.userId === userId ? { ...d, unread: 0 } : d
    ));
    if (sendMessageRef.current) {
      sendMessageRef.current({ type: 'private_history', data: { userId } });
      sendMessageRef.current({ type: 'mark_read', data: { senderId: userId } });
    }
  }, []);

  const closePrivateChat = useCallback(() => {
    setPrivateChat(null);
    setPrivateTypingUser(null);
  }, []);

  const handleWs = useCallback((msg) => {
    switch (msg.type) {
      case 'dialogs_list': {
        const list = msg.data || [];
        setDialogs(list);
        setUnreadByUser(prev => {
          const next = { ...prev };
          list.forEach(d => {
            if (d.unread > 0) next[d.userId] = true;
          });
          return next;
        });
        return true;
      }

      case 'dialog_update': {
        const { userId, nickname, lastText, lastAt, unread, lastFromMe, lastIsRead } = msg.data;
        setDialogs(prev => {
          const existing = prev.find(d => d.userId === userId);
          let updated;
          if (existing) {
            updated = prev.map(d => {
              if (d.userId !== userId) return d;
              const nextUnread =
                unread === 'increment' ? (d.unread || 0) + 1 :
                (typeof unread === 'number' ? unread : d.unread || 0);
              return {
                ...d,
                nickname: nickname || d.nickname,
                lastText,
                lastAt,
                unread: nextUnread,
                lastFromMe: typeof lastFromMe === 'boolean' ? lastFromMe : d.lastFromMe,
                lastIsRead: typeof lastIsRead === 'boolean' ? lastIsRead : d.lastIsRead,
              };
            });
          } else {
            updated = [
              ...prev,
              {
                userId,
                nickname,
                lastText,
                lastAt,
                unread: unread === 'increment' ? 1 : (typeof unread === 'number' ? unread : 0),
                lastFromMe: !!lastFromMe,
                lastIsRead: lastIsRead === true,
              },
            ];
          }
          return [...updated].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
        });
        return true;
      }

      case 'dialog_unread_reset':
        setDialogs(prev => prev.map(d =>
          d.userId === msg.data.userId ? { ...d, unread: 0 } : d
        ));
        return true;

      case 'dialog_read_update':
        setDialogs(prev => prev.map(d =>
          d.userId === msg.data.userId ? { ...d, lastIsRead: true } : d
        ));
        return true;

      case 'private_message': {
        setPrivateChat(prev => {
          if (!prev || prev.userId !== msg.data.senderId) return prev;
          return {
            ...prev,
            historyLoaded: true,
            messages: [...(prev.messages || []), { ...msg.data, is_read: false }],
          };
        });
        const cur = privateChatRef.current;
        if (!cur || cur.userId !== msg.data.senderId) {
          setUnreadByUser(prev => ({ ...prev, [msg.data.senderId]: true }));
        } else {
          if (sendMessageRef.current) {
            sendMessageRef.current({ type: 'mark_read', data: { senderId: msg.data.senderId } });
          }
          setPrivateChat(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map(m =>
                m.senderId === msg.data.senderId ? { ...m, is_read: true } : m
              ),
            };
          });
        }
        return true;
      }

      case 'private_message_sent': {
        setPrivateChat(prev => {
          if (!prev || prev.userId !== msg.data.recipientId) return prev;
          return {
            ...prev,
            historyLoaded: true,
            messages: [...(prev.messages || []), { ...msg.data, is_read: false }],
          };
        });
        return true;
      }

      case 'private_typing':
        if (msg.data.senderId !== myIdRef.current) {
          setPrivateTypingUser(msg.data.isTyping ? msg.data.senderNickname : null);
        }
        return true;

      case 'private_history':
        setPrivateChat(prev => {
          if (!prev || prev.userId !== msg.data.userId) return prev;
          return { ...prev, historyLoaded: true, messages: msg.data.messages };
        });
        setUnreadByUser(prev => {
          const { [msg.data.userId]: _, ...rest } = prev;
          return rest;
        });
        return true;

      case 'private_message_deleted': {
        const { messageId, senderId, recipientId } = msg.data;

        setPrivateChat(prev => {
          if (!prev) return prev;
          if (prev.userId !== senderId && prev.userId !== recipientId) return prev;

          const wasLast = prev.messages[prev.messages.length - 1]?.id === messageId;
          const nextMessages = prev.messages.filter(m => m.id !== messageId);

          if (wasLast) {
            const newLast = nextMessages[nextMessages.length - 1];
            const newPreview = previewFromMessage(newLast);
            const newLastAt = newLast?.created_at || prev.lastAt;

            setDialogs(d => d.map(dd => {
              if (dd.userId !== prev.userId) return dd;
              return { ...dd, lastText: newPreview, lastAt: newLastAt };
            }));
          }

          return { ...prev, messages: nextMessages };
        });
        return true;
      }

      case 'private_reaction_update': {
        const { messageId, reactions } = msg.data;
        setPrivateChat(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map(m =>
              m.id === messageId ? { ...m, reactions } : m
            ),
          };
        });
        return true;
      }

      case 'message_read': {
        const { senderId, recipientId, messageIds } = msg.data;
        setPrivateChat(prev => {
          if (!prev) return prev;
          if (prev.userId === senderId || prev.userId === recipientId) {
            return {
              ...prev,
              messages: prev.messages.map(m =>
                messageIds.includes(m.id) ? { ...m, is_read: true } : m
              ),
            };
          }
          return prev;
        });
        return true;
      }

      default:
        return false;
    }
  }, []);

  return {
    privateChat,
    privateTypingUser,
    unreadByUser,
    dialogs,
    openPrivateChat,
    closePrivateChat,
    handleWs,
  };
};