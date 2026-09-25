import { useEffect, useState } from 'react';

/*
  [2.37.0] Тост о новой версии фронта. Кнопка «Обновить сейчас» +
  авто-reload через AUTO_RELOAD_S. «Позже» — отложить (см. Chat.jsx).
*/

const AUTO_RELOAD_S = 30;

const UpdateToast = ({ open, onReload, onDefer }) => {
  const [seconds, setSeconds] = useState(AUTO_RELOAD_S);

  useEffect(() => {
    if (!open) return;
    setSeconds(AUTO_RELOAD_S);
    const id = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(id);
          onReload?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [open, onReload]);

  if (!open) return null;

  return (
    <div className="update-toast" role="alert" aria-live="polite">
      <div className="update-toast-mascot" aria-hidden="true">
        <img src="/mascot.png" alt="" draggable={false} />
      </div>
      <div className="update-toast-body">
        <div className="update-toast-title">Обновление готово</div>
        <div className="update-toast-sub">
          Обновимся через {seconds}с — или нажми сейчас
        </div>
      </div>
      <div className="update-toast-actions">
        <button
          type="button"
          className="update-toast-btn update-toast-btn--primary"
          onClick={onReload}
        >
          Обновить
        </button>
        <button
          type="button"
          className="update-toast-btn update-toast-btn--ghost"
          onClick={onDefer}
        >
          Позже
        </button>
      </div>
    </div>
  );
};

export default UpdateToast;