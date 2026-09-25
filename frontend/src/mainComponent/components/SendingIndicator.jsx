/*
  [2.43.0] Индикатор отправки контента. Заменяет строку ввода,
           пока идёт upload фото / голосового / видео.
           Маскот + текст + три пульса. Розовый, чёрная обводка,
           живой — в стиле crew.
*/

const SendingIndicator = ({ label = 'Отправка' }) => (
  <div
    className="sending-indicator"
    role="status"
    aria-live="polite"
    aria-label={label}
  >
    <div className="sending-indicator-mascot" aria-hidden="true" />
    <div className="sending-indicator-body">
      <div className="sending-indicator-label">{label}</div>
      <div className="sending-indicator-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  </div>
);

export default SendingIndicator;