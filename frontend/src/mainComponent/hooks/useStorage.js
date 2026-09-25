import { useState, useRef, useEffect, useCallback } from 'react';

/*
  [2.47.0] Хранилище. Хук держит состояние и обрабатывает WS-события.
  save/delete/reorder — только через sendMessage.
*/

export const useStorage = ({ sendMessage, isAuth }) => {
  const [items, setItems] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(0);

  const sendRef = useRef(sendMessage);
  const isAuthRef = useRef(isAuth);

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { isAuthRef.current = isAuth; }, [isAuth]);

  const showError = useCallback((text) => {
    setError(text);
    setTimeout(() => setError(''), 3000);
  }, []);

  const handleWs = useCallback((msg) => {
    switch (msg.type) {
      case 'storage_list':
        setItems(Array.isArray(msg.data) ? msg.data : []);
        setIsLoaded(true);
        return true;

      case 'storage_saved': {
        setItems(prev => [...prev, msg.data]);
        setLastSavedAt(Date.now());
        return true;
      }

      case 'storage_deleted':
        setItems(prev => prev.filter(i => i.id !== msg.data.id));
        return true;

      case 'storage_reordered': {
        const ids = msg.data.ids || [];
        setItems(prev => {
          const map = new Map(prev.map(i => [i.id, i]));
          const idsSet = new Set(ids);
          const next = ids.map((id, idx) => {
            const it = map.get(id);
            return it ? { ...it, sortOrder: idx } : null;
          }).filter(Boolean);
          for (let i = 0; i < prev.length; i++) {
            const it = prev[i];
            if (!idsSet.has(it.id)) next.push(it);
          }
          return next;
        });
        return true;
      }

      case 'storage_error':
        showError(msg.data?.message || 'Ошибка хранилища');
        return true;

      default:
        return false;
    }
  }, [showError]);

  const saveToStorage = useCallback((type, payload, source) => {
    if (!sendRef.current || !isAuthRef.current) return;
    sendRef.current({ type: 'storage_save', data: { type, payload, source } });
  }, []);

  const deleteFromStorage = useCallback((id) => {
    if (!sendRef.current || !isAuthRef.current || !id) return;
    sendRef.current({ type: 'storage_delete', data: { id } });
  }, []);

  const reorder = useCallback((ids) => {
    if (!sendRef.current || !isAuthRef.current) return;
    if (!Array.isArray(ids) || ids.length === 0) return;

    // [2.48.2] Оптимистично применяем новый порядок локально.
    // Иначе между сбросом orderPreview в StorageGrid и ответом
    // storage_reordered — окно, в котором карточки прыгают обратно.
    setItems(prev => {
      const map = new Map(prev.map(i => [i.id, i]));
      const idsSet = new Set(ids);
      const next = ids.map((id, idx) => {
        const it = map.get(id);
        return it ? { ...it, sortOrder: idx } : null;
      }).filter(Boolean);
      for (let i = 0; i < prev.length; i++) {
        const it = prev[i];
        if (!idsSet.has(it.id)) next.push(it);
      }
      return next;
    });

    sendRef.current({ type: 'storage_reorder', data: { ids } });
  }, []);

  return {
    items,
    isLoaded,
    error,
    lastSavedAt,
    handleWs,
    saveToStorage,
    deleteFromStorage,
    reorder,
  };
};