import React from 'react';

/*
  [2.32.40] Универсальный модал. Пропсы:
            danger      — красная кнопка подтверждения
            confirmText — текст кнопки подтверждения (по умолчанию «Да»)
            cancelText  — текст кнопки отмены (по умолчанию «Отмена»)
            zIndex      — переопределить z-index (для модалей поверх панелей
                          с большим z-index, например профиля)
            Заменил ConfirmBanModal — тот был с инлайн-стилями,
            не подхватывал тёмную тему.
*/
const ConfirmModal = ({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmText = 'Да',
  cancelText = 'Отмена',
  danger = false,
  zIndex = null,
}) => {
  if (!open) return null;

  const overlayStyle = zIndex != null ? { zIndex } : undefined;
  const modalStyle = zIndex != null ? { zIndex: zIndex + 1 } : undefined;

  return (
    <>
      <div className="blur-overlay" style={overlayStyle} onClick={onCancel} />
      <div className="confirm-modal" style={modalStyle}>
        <div className="confirm-modal-content">
          <h3>{title || 'Подтверждение'}</h3>
          <p>{description || 'Вы уверены?'}</p>
          <div className="confirm-modal-actions">
            <button
              className={`btn confirm-btn${danger ? ' confirm-btn--danger' : ''}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
            <button className="btn cancel-btn" onClick={onCancel}>
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmModal;