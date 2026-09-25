import { useEffect, useState, useRef } from 'react';

/*
  [2.47.0] Тост «Сохранено в хранилище». Триггерится сменой timestamp.
*/

const StorageToast = ({ trigger }) => {
  const [visible, setVisible] = useState(false);
  const prevRef = useRef(0);

  useEffect(() => {
    if (!trigger) return;
    if (trigger === prevRef.current) return;
    prevRef.current = trigger;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div className="storage-toast" role="status" aria-live="polite">
      <span className="storage-toast-icon" aria-hidden="true">🗄️</span>
      <span className="storage-toast-text">Сохранено в хранилище</span>
    </div>
  );
};

export default StorageToast;