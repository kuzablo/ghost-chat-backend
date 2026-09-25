/*
  [2.42.3] Убран long-press. mic → voice, cam → video, обе — обычный клик.
  [2.42.1] Вращающийся «ОТПРАВИТЬ» на send-кнопке.
  [2.42.0] mic+cam ↔ send с плавным переходом.
*/

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
    <path d="M9 21h6" />
  </svg>
);

const CamIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="3" />
    <path d="M16 10l5-3v10l-5-3z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const SEND_CHARS = ['О', 'Т', 'П', 'Р', 'А', 'В', 'И', 'Т', 'Ь'];

const InputActionButtons = ({
  active,
  disabled = false,
  sending = false,
  rotating = false,
  onSend,
  onVoiceClick,
  onCameraClick,
}) => {
  const cls = `iab${active ? ' iab--active' : ''}`;

  return (
    <div className={cls} role="group" aria-label="Действия сообщения">
      {/* MICROPHONE */}
      <button
        type="button"
        className="iab-btn iab-btn--mic"
        onClick={active ? undefined : onVoiceClick}
        disabled={disabled || active}
        aria-label="Записать голосовое"
        title="Записать голосовое"
        tabIndex={active ? -1 : 0}
      >
        <MicIcon />
      </button>

      {/* CAMERA */}
      <button
        type="button"
        className="iab-btn iab-btn--cam"
        onClick={active ? undefined : onCameraClick}
        disabled={disabled || active}
        aria-label="Записать видео"
        title="Записать видео-сообщение"
        tabIndex={active ? -1 : 0}
      >
        <CamIcon />
      </button>

      {/* SEND */}
      <button
        type="button"
        className={`iab-btn iab-btn--send${sending ? ' iab-btn--sending' : ''}`}
        onClick={active && !disabled ? onSend : undefined}
        disabled={disabled || !active}
        aria-label="Отправить"
        title="Отправить"
        tabIndex={active ? 0 : -1}
      >
        {rotating && (
          <span className="iab-rotating-text" aria-hidden="true">
            {SEND_CHARS.map((char, idx) => {
              const angle = (360 / SEND_CHARS.length) * idx;
              return (
                <span
                  key={idx}
                  style={{ transform: `rotate(${angle}deg) translate(0, -26px)` }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        )}
        <SendIcon />
        <span className="iab-spinner" aria-hidden="true" />
      </button>
    </div>
  );
};

export default InputActionButtons;