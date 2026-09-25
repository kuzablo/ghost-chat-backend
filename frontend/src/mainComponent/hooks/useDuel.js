import { useState, useRef, useEffect, useCallback } from 'react';

/*
  [новый хук, рефакторинг 2.14.30]
  Вынесено из Chat.jsx — дуэли:
    - state: duelInvite, duelState;
    - requestDuel / acceptDuel / choose — методы, шлют WS-сообщения;
    - clearInvite / clearState — закрыть без отправки;
    - handleWs(msg) — WS-фильтр для 5 типов дуэли. Возвращает true,
      если сообщение обработано, иначе false.

  duelNotice НЕ здесь: им пользуются и друзья, и админ-ошибки.
  Хук принимает onNotice(text) — колбэк для «Вызов отправлен» и «не ответил».

  sendMessage/isAuth/onNotice заворачиваются в refs, чтобы handleWs
  был стабильный и не пересоздавал WS-подписку.
*/
export const useDuel = ({ sendMessage, isAuth, onNotice }) => {
  const [duelInvite, setDuelInvite] = useState(null);
  const [duelState, setDuelState] = useState(null);

  const sendMessageRef = useRef(sendMessage);
  const isAuthRef = useRef(isAuth);
  const onNoticeRef = useRef(onNotice);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { isAuthRef.current = isAuth; }, [isAuth]);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);

  const requestDuel = useCallback((targetId) => {
    if (sendMessageRef.current && isAuthRef.current) {
      sendMessageRef.current({ type: 'duel_request', data: { targetId } });
    }
  }, []);

  const acceptDuel = useCallback(() => {
    const invite = duelInvite;
    if (invite && sendMessageRef.current && isAuthRef.current) {
      sendMessageRef.current({ type: 'duel_accept', data: { fromId: invite.fromId } });
    }
  }, [duelInvite]);

  const choose = useCallback((choice) => {
    if (duelState && sendMessageRef.current && isAuthRef.current) {
      sendMessageRef.current({ type: 'duel_choice', data: { choice } });
      setDuelState(prev => ({ ...prev, myChoice: choice }));
    }
  }, [duelState]);

  const clearInvite = useCallback(() => setDuelInvite(null), []);

  // WS-фильтр. Возвращает true, если сообщение принадлежит дуэлям.
  const handleWs = useCallback((msg) => {
    switch (msg.type) {
      case 'duel_invite':
        setDuelInvite(msg.data);
        return true;
      case 'duel_request_sent':
        if (onNoticeRef.current) {
          onNoticeRef.current(`Вызов ${msg.data.targetNick} отправлен`);
        }
        return true;
      case 'duel_timeout':
        if (onNoticeRef.current) {
          onNoticeRef.current(`${msg.data.targetNick} не ответил на вызов`);
        }
        return true;
      case 'duel_start':
        setDuelState({ opponentNick: msg.data.opponentNick, myChoice: null });
        setDuelInvite(null);
        return true;
      case 'duel_result':
        setDuelState(prev => prev ? { ...prev, result: msg.data.result } : null);
        setTimeout(() => setDuelState(null), 5000);
        return true;
      default:
        return false;
    }
  }, []);

  return {
    duelInvite,
    duelState,
    requestDuel,
    acceptDuel,
    choose,
    clearInvite,
    handleWs,
  };
};