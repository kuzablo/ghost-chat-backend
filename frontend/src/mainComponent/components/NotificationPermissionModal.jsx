import React from 'react';
import Mascot from '../Mascot';

/*
  [2.32.16] Модалка запроса разрешения на уведомления.
            Показывается раз в сутки, пока юзер не выбрал явно.
            На iOS работает только в установленном PWA.
*/
const NotificationPermissionModal = ({ open, onAllow, onLater }) => {
  if (!open) return null;

  return (
    <>
      <div className="blur-overlay" />
      <div className="notif-modal">
        <Mascot size={80} />

        <h3 className="notif-modal-title">🔔 Не пропускай сообщения</h3>

        <p className="notif-modal-text">
          Разреши уведомления — и ты узнаешь о новом сообщении, даже если
          чат свёрнут или телефон в кармане. На иконке приложения появится
          число непрочитанных.
        </p>

        <p className="notif-modal-note">
          Ничего лишнего. Только новые сообщения от друзей.
        </p>

        <button className="btn notif-modal-allow" onClick={onAllow}>
          Разрешить уведомления
        </button>

        <button className="notif-modal-later" onClick={onLater}>
          Позже
        </button>
      </div>
    </>
  );
};

export default NotificationPermissionModal;