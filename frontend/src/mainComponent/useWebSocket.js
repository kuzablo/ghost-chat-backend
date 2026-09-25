import { useEffect, useRef, useState, useCallback } from 'react';

const HEARTBEAT_INTERVAL_MS = 25000;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

/*
  [2.37.3] onclose ставит setError с маркером при спец-кодах:
           4003 → 'auth-failed', 4006 → 'banned-forever',
           4001 → 'auth-timeout'. Chat.jsx реагирует forceLogout-ом.
  [2.28.5] onerror больше не ставит setError/setIsConnected.
  [2.28.4] 4000 (Replaced by new connection) — не реконнектим.
  [2.28.2] sendLog() — диагностика на сервер.
  [2.28.1] heartbeat + переподключение из фона.
*/
export const useWebSocket = (url, token, onMessage) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [ws, setWs] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const tokenRef = useRef(token);
  const connectRef = useRef(null);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const sendLog = (text) => {
    try {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'client_log', data: { text } }));
      }
    } catch { /* noop */ }
  };

  const clearHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return;
    if (reconnectTimeoutRef.current) return;

    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, attempt), RECONNECT_MAX_MS);
    reconnectAttemptRef.current += 1;

    console.log(`[useWebSocket] Reconnect через ${Math.round(delay)}ms (попытка ${attempt + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectRef.current?.();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (!tokenRef.current) return;

    const existing = wsRef.current;
    if (existing && (
      existing.readyState === WebSocket.OPEN ||
      existing.readyState === WebSocket.CONNECTING
    )) {
      return;
    }

    if (existing) {
      try { existing.close(1000, 'New connection'); } catch { /* noop */ }
    }
    clearHeartbeat();

    let socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      console.error('[useWebSocket] Не удалось создать WebSocket:', e);
      scheduleReconnect();
      return;
    }

    wsRef.current = socket;
    setWs(socket);

    const hasToken = !!tokenRef.current;
    sendLog(`new WebSocket, hasToken=${hasToken}`);

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setIsConnected(true);
      setError(null);
      console.log('[useWebSocket] Connected');
      sendLog('onopen');

      if (tokenRef.current) {
        socket.send(JSON.stringify({ type: 'auth', token: tokenRef.current }));
        sendLog('auth sent');
      } else {
        sendLog('auth NOT sent — token empty');
      }

      clearHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'ping', data: { t: Date.now() } }));
          } catch { /* noop */ }
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pong') return;
        if (onMessageRef.current) onMessageRef.current(msg);
      } catch (err) {
        console.error('[useWebSocket] Parse error:', err);
      }
    };

    socket.onerror = () => {
      console.error('[useWebSocket] Error');
      sendLog('onerror');
    };

    socket.onclose = (e) => {
      clearHeartbeat();
      setIsConnected(false);
      setWs(null);
      wsRef.current = null;

      console.warn('[useWebSocket] Closed:', e.code, e.reason);
      sendLog(`onclose code=${e.code} reason=${e.reason || ''} clean=${e.wasClean}`);

      if (unmountedRef.current) return;

      // [2.37.3] Спец-коды: сообщаем Chat.jsx причину.
      if (e.code === 4003) {
        setError('auth-failed');
        return;
      }
      if (e.code === 4006) {
        setError('banned-forever');
        return;
      }
      if (e.code === 4001) {
        setError('auth-timeout');
        return;
      }

      if (e.code === 1000) return;
      if (e.code === 4000 || e.code === 4005) return;

      scheduleReconnect();
    };
  }, [url, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    unmountedRef.current = false;
    if (token) {
      connect();
    }
    return () => {
      unmountedRef.current = true;
      clearHeartbeat();
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'Component unmount'); } catch { /* noop */ }
      }
    };
  }, [connect, token]);

  useEffect(() => {
    const ensureAlive = () => {
      if (unmountedRef.current) return;
      if (!tokenRef.current) return;

      const socket = wsRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        console.log('[useWebSocket] Возврат из фона — переподключение');
        reconnectAttemptRef.current = 0;
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
        connectRef.current?.();
      }
    };

    const onVisibility = () => {
      if (!document.hidden) ensureAlive();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', ensureAlive);
    window.addEventListener('pageshow', ensureAlive);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', ensureAlive);
      window.removeEventListener('pageshow', ensureAlive);
    };
  }, []);

  const sendMessage = useCallback((data) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const close = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(1000, 'Manual close'); } catch { /* noop */ }
    }
  }, []);

  return { isConnected, error, sendMessage, close, ws };
};